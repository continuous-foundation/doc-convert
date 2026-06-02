import path from 'node:path';
import type { PipelineStep } from '../../engine/types.js';
import { logStep } from '../../engine/step-log.js';
import { stepOpts } from '../../engine/step-context.js';
import { readUtf8, writeUtf8 } from '../shared/fs.js';
import { findProjectChildBlock, openMystProject } from '../shared/myst-yaml-project.js';
import { resolveProjectConfigPath } from '../shared/myst-config.js';
import { unquoteYamlScalar, yamlQuote } from '../shared/yaml-scalar.js';

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

function normalizeOrgName(s: string): string {
  return String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function extractInstitutionQueries(affiliation: string): string[] {
  const cleaned = affiliation.replace(/\\+/g, ' ').replace(/\s+/g, ' ').trim();
  const segments = cleaned
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  const queries: string[] = [];

  for (const seg of segments) {
    const uniMatches = [
      ...seg.matchAll(/\b([^,;]+(?:University|Institute|Universit[eé]|Universidad)[^,;]*)/gi),
    ].map((m) => m[1].trim());
    if (uniMatches.length) {
      queries.push(uniMatches[uniMatches.length - 1]);
      continue;
    }

    const otherMatches = [
      ...seg.matchAll(
        /\b([^,;]+(?:National Laboratory|Hospital|Academy|Laboratory|Laboratories)[^,;]*)/gi,
      ),
    ].map((m) => m[1].trim());
    if (otherMatches.length) {
      queries.push(otherMatches[otherMatches.length - 1]);
    }
  }

  return [...new Set(queries.filter((q) => q.length >= 4))];
}

function computeMatchScore(query: string, orgName: string): number {
  const a = normalizeOrgName(query);
  const b = normalizeOrgName(orgName);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    return 0.75 + 0.2 * (shorter / longer);
  }

  const at = new Set(a.split(/\s+/).filter((t) => t.length > 2));
  const bt = new Set(b.split(/\s+/).filter((t) => t.length > 2));
  if (!at.size || !bt.size) return 0;

  let overlap = 0;
  for (const t of at) {
    if (bt.has(t)) overlap++;
  }
  return overlap / (at.size + bt.size - overlap);
}

function parseRorItem(item: unknown): { id: string; name: string } | null {
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;

  const legacyOrg = record.organization;
  if (legacyOrg && typeof legacyOrg === 'object') {
    const org = legacyOrg as Record<string, unknown>;
    const id = typeof org.id === 'string' ? org.id : null;
    const name = typeof org.name === 'string' ? org.name : null;
    if (id && name) return { id, name };
  }

  const id = typeof record.id === 'string' ? record.id : null;
  const names = Array.isArray(record.names) ? record.names : [];
  let name: string | null = null;

  for (const entry of names) {
    if (!entry || typeof entry !== 'object') continue;
    const types = Array.isArray((entry as { types?: unknown }).types)
      ? ((entry as { types: string[] }).types ?? [])
      : [];
    const value = (entry as { value?: unknown }).value;
    if (types.includes('ror_display') && typeof value === 'string' && value) {
      name = value;
      break;
    }
  }

  if (!name) {
    for (const entry of names) {
      if (!entry || typeof entry !== 'object') continue;
      const value = (entry as { value?: unknown }).value;
      if (typeof value === 'string' && value) {
        name = value;
        break;
      }
    }
  }

  return id && name ? { id, name } : null;
}

async function searchRorQuery(query: string): Promise<RorMatch | null> {
  const url = `https://api.ror.org/organizations?query=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const json = (await res.json()) as { items?: unknown[] };
    const items = Array.isArray(json?.items) ? json.items : [];
    if (!items.length) return null;

    let best: RorMatch | null = null;
    for (const item of items.slice(0, 5)) {
      const parsed = parseRorItem(item);
      if (!parsed) continue;

      const apiScore =
        item && typeof item === 'object' && typeof (item as { score?: unknown }).score === 'number'
          ? ((item as { score: number }).score ?? 0)
          : 0;
      const score = apiScore > 0 ? apiScore : computeMatchScore(query, parsed.name);

      if (!best || score > best.score) {
        best = { id: parsed.id, name: parsed.name, score };
      }
    }

    return best;
  } catch {
    return null;
  }
}

async function resolveAffiliationRor(
  affiliation: string,
  minScore: number,
): Promise<RorMatch | null> {
  const queries = extractInstitutionQueries(affiliation);
  if (!queries.length) queries.push(affiliation);

  let best: (RorMatch & { query: string }) | null = null;
  for (const query of queries) {
    const match = await searchRorQuery(query);
    if (!match) continue;
    if (!best || match.score > best.score) {
      best = { ...match, query };
    }
  }

  if (!best) return null;
  return acceptRorMatch(best.query, best, minScore) ? best : null;
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
  const block = openMystProject(mystYaml);
  const authorsBlock = findProjectChildBlock(
    block.lines,
    block.projectIdx,
    block.projectEnd,
    'authors',
  );
  if (!authorsBlock) {
    return { updatedYaml: mystYaml, changes: 0 };
  }

  const lines = block.lines;
  const authorsIdx = authorsBlock.start;
  const authorsEnd = authorsBlock.end;

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
          resolved = await resolveAffiliationRor(affiliation, opts.minScore);
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

  logStep([
    'Done.',
    `${path.relative(cwd, mystPath)}: ${changes} affiliation(s) enriched (ROR ${options.rorLookup ? 'on' : 'off'}, minScore ${minScore})`,
    changed ? undefined : 'no changes',
    options.dryRun ? '(dry-run)' : null,
  ]);
}

export const enrichAffiliationsRorStep: PipelineStep = {
  id: 'enrichAffiliationsRor',
  label: 'Enrich affiliations via ROR',
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
