import fs from 'node:fs';
import path from 'node:path';
import type { PipelineStep } from '../../engine/types.js';
import { stepOpts } from '../../engine/step-context.js';
import { resolveProjectConfigPath } from '../shared/myst-config.js';

const DEFAULT_MYST = 'myst.yml';
const DEFAULT_MIN_SCORE = 0.8;

interface RunEnrichAffiliationsRorOptions {
  myst?: string;
  dryRun: boolean;
  rorLookup: boolean;
  minScore?: number;
  cwd: string;
}

interface RorMatch {
  id: string;
  name: string;
  score: number;
}

function readUtf8(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

function writeUtf8(p: string, content: string, dryRun: boolean): void {
  if (dryRun) return;
  fs.writeFileSync(p, content, 'utf8');
}

function yamlQuote(s: string): string {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function unquoteYamlScalar(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function normalizeOrgName(s: string): string {
  return String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function searchRor(query: string): Promise<RorMatch | null> {
  const url = `https://api.ror.org/organizations?query=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      items?: Array<{
        score?: number;
        organization?: { id?: string; name?: string };
      }>;
    };
    const items = Array.isArray(json?.items) ? json.items : [];
    if (!items.length) return null;

    items.sort((a, b) => (b?.score ?? 0) - (a?.score ?? 0));
    const top = items[0];
    const score = typeof top?.score === 'number' ? top.score : 0;
    const org = top?.organization;
    const id = typeof org?.id === 'string' ? org.id : null;
    const name = typeof org?.name === 'string' ? org.name : null;
    if (!id || !name) return null;
    return { id, name, score };
  } catch {
    return null;
  }
}

function acceptRorMatch(original: string, match: RorMatch, minScore: number): boolean {
  if (match.score >= minScore) return true;

  const a = normalizeOrgName(original);
  const b = normalizeOrgName(match.name);

  if ((a.includes(b) || b.includes(a)) && match.score >= Math.min(0.7, minScore)) {
    return true;
  }
  return false;
}

async function enrichMystAuthorsAffiliations(
  mystYaml: string,
  opts: { rorLookup: boolean; minScore: number },
): Promise<{ updatedYaml: string; changes: number }> {
  const lines = mystYaml.split('\n');

  const projectIdx = lines.findIndex((l) => /^\s*project:\s*$/.test(l));
  if (projectIdx === -1) throw new Error('Project config has no `project:` block');

  let projectEnd = lines.length;
  for (let i = projectIdx + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) {
      projectEnd = i;
      break;
    }
  }

  let authorsIdx = -1;
  for (let i = projectIdx + 1; i < projectEnd; i++) {
    if (/^\s{2}authors:\s*$/.test(lines[i])) {
      authorsIdx = i;
      break;
    }
  }
  if (authorsIdx === -1) {
    return { updatedYaml: mystYaml, changes: 0 };
  }

  let authorsEnd = projectEnd;
  for (let i = authorsIdx + 1; i < projectEnd; i++) {
    if (/^\s{2}[A-Za-z0-9_-]+:\s*/.test(lines[i])) {
      authorsEnd = i;
      break;
    }
  }

  let changes = 0;
  const cache = new Map<string, RorMatch | null>();

  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i < authorsIdx || i >= authorsEnd) {
      out.push(lines[i]);
      continue;
    }

    const line = lines[i];
    out.push(line);

    if (!/^\s{6}affiliations:\s*$/.test(line)) continue;

    let j = i + 1;
    while (j < authorsEnd) {
      const l = lines[j];

      if (!/^\s{8}-\s+/.test(l)) break;

      const valueText = l.replace(/^\s{8}-\s+/, '');
      const isLikelyObject = /^[A-Za-z0-9_-]+:\s*/.test(valueText);
      if (isLikelyObject) {
        out.push(l);
        j++;
        while (j < authorsEnd && /^\s{10,}\S/.test(lines[j])) {
          out.push(lines[j]);
          j++;
        }
        continue;
      }

      const affiliation = unquoteYamlScalar(valueText);

      let resolved = cache.get(affiliation);
      if (resolved === undefined) {
        if (!opts.rorLookup) {
          resolved = null;
        } else {
          const match = await searchRor(affiliation);
          if (match && acceptRorMatch(affiliation, match, opts.minScore)) {
            resolved = match;
          } else {
            resolved = null;
          }
        }
        cache.set(affiliation, resolved);
      }

      if (!resolved) {
        out.push(`        - ${yamlQuote(affiliation)}`);
        j++;
        continue;
      }

      const canon = resolved.name;
      const rorId = resolved.id;

      changes++;
      out.push(`        - institution: ${yamlQuote(canon)}`);
      out.push(`          ror: ${yamlQuote(rorId)}`);
      if (normalizeOrgName(canon) !== normalizeOrgName(affiliation)) {
        out.push(`          name: ${yamlQuote(affiliation)}`);
      }

      j++;
    }

    i = j - 1;
  }

  return { updatedYaml: out.join('\n'), changes };
}

/**
 * Enrich author affiliation strings in the project config using ROR (Research Organization Registry).
 * Resolves plain-string affiliations to MyST affiliation objects with `institution` and `ror` fields.
 */
async function enrichAffiliationsRor(
  options: RunEnrichAffiliationsRorOptions,
): Promise<void> {
  const cwd = options.cwd;
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;

  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 1) {
    throw new Error(`minScore must be between 0 and 1 (got ${minScore})`);
  }

  const mystPath = resolveProjectConfigPath(cwd, options.myst ?? DEFAULT_MYST);

  const mystYaml = readUtf8(mystPath);
  const { updatedYaml, changes } = await enrichMystAuthorsAffiliations(mystYaml, {
    rorLookup: options.rorLookup,
    minScore,
  });

  const changed = updatedYaml !== mystYaml;

  if (changed) writeUtf8(mystPath, updatedYaml, options.dryRun);

  process.stdout.write(
    [
      'Done.',
      `- config: ${path.relative(cwd, mystPath)}`,
      `- ROR lookup: ${options.rorLookup ? 'enabled' : 'disabled'}`,
      `- minScore: ${minScore}`,
      `- affiliation enrichments applied: ${changes}`,
      changed ? '- config updated' : '- no changes',
      options.dryRun ? '(dry-run: no files written)' : null,
    ]
      .filter(Boolean)
      .join('\n') + '\n',
  );
}

/**
 * Resolve plain-string author affiliations in `myst.yml` to ROR-backed
 * institution objects (when `--ror-lookup` is enabled).
 */
export const enrichAffiliationsRorStep: PipelineStep = {
  id: 'enrichAffiliationsRor',
  label: 'Enrich affiliations via ROR',
  inputs: ['myst'],
  run: async (ctx) => {
    const o = stepOpts(ctx);
    await enrichAffiliationsRor({
      myst: 'myst.yml',
      dryRun: o.dryRun,
      rorLookup: ctx.options.rorLookup,
      minScore: ctx.options.rorMinScore,
      cwd: o.cwd,
    });
  },
};
