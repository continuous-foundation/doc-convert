import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PipelineStep } from '../../engine/types.js';
import { stepOpts } from '../../engine/step-context.js';

const DEFAULT_CONFIG = 'myst.yml';
const LEGACY_CONFIG = 'curvenote.yml';

type MetadataEntry = { key: string; rawValue: string };

function fileExists(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function readProjectIdFromFile(configPath: string): string | null {
  if (!fileExists(configPath)) return null;
  let content: string;
  try {
    content = fs.readFileSync(configPath, 'utf8');
  } catch {
    return null;
  }
  const m = content.match(/^\s*id:\s*([^\s#]+)\s*$/m);
  return m ? m[1] : null;
}

function readExistingProjectId(configPath: string): string | null {
  const primary = readProjectIdFromFile(configPath);
  if (primary) return primary;
  const dir = path.dirname(configPath);
  const base = path.basename(configPath);
  if (base === LEGACY_CONFIG) return null;
  const legacyPath = path.join(dir, LEGACY_CONFIG);
  if (legacyPath === configPath) return null;
  return readProjectIdFromFile(legacyPath);
}

function readMetadataEntries(metadataPath: string): MetadataEntry[] {
  if (!fileExists(metadataPath)) return [];
  let content: string;
  try {
    content = fs.readFileSync(metadataPath, 'utf8');
  } catch {
    return [];
  }

  const entries: MetadataEntry[] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*?)\s*$/);
    if (!m) continue;
    const key = m[1];
    const rawValue = m[2];
    if (!rawValue) continue;
    entries.push({ key, rawValue });
  }
  return entries;
}

function buildScaffold(projectId: string, metadataEntries: MetadataEntry[]): string {
  const reservedProjectKeys = new Set([
    'id',
    'open_access',
    'license',
    'plugins',
    'toc',
    'exports',
  ]);

  const metadataProjectLines = metadataEntries
    .filter((entry) => !reservedProjectKeys.has(entry.key))
    .map((entry) => `  ${entry.key}: ${entry.rawValue}`);

  return [
    '# See docs at: https://mystmd.org/guide/frontmatter',
    'version: 1',
    'project:',
    `  id: ${projectId}`,
    ...metadataProjectLines,
    '  open_access: true',
    '  license: CC-BY-NC-ND-4.0',
    '  plugins:',
    '    - plugins/hermeneutics.mjs',
    '  # To autogenerate a Table of Contents, run "myst init --write-toc"',
    '  toc:',
    '    - file: article.md',
    '  exports:',
    '    - format: pdf',
    '      template: ../../jdh-typst-template',
    '      article: article.md',
    '      output: article.pdf',
    '      qr_code: ./generated/qr.png',
    '      fingerprint: ./generated/fingerprint.png',
    'site:',
    '  template: book-theme',
    '  # options:',
    '  #   favicon: favicon.ico',
    '  #   logo: site_logo.png',
    '',
  ].join('\n');
}

async function initMystConfig(options: {
  configPath: string;
  metadataPath?: string;
  forcedId?: string;
  dryRun: boolean;
  cwd: string;
}): Promise<void> {
  const configPath = path.resolve(options.cwd, options.configPath || DEFAULT_CONFIG);
  const metadataPath = options.metadataPath
    ? path.resolve(options.cwd, options.metadataPath)
    : path.resolve(path.dirname(configPath), '..', 'metadata.yml');

  const existedBefore = fileExists(configPath);
  const existingId = readExistingProjectId(configPath);
  const metadataEntries = readMetadataEntries(metadataPath);

  let projectId: string;
  let idSource: 'forced' | 'preserved' | 'generated';
  if (options.forcedId) {
    projectId = options.forcedId;
    idSource = 'forced';
  } else if (existingId) {
    projectId = existingId;
    idSource = 'preserved';
  } else {
    projectId = crypto.randomUUID();
    idSource = 'generated';
  }

  const scaffold = buildScaffold(projectId, metadataEntries);

  if (options.dryRun) {
    process.stdout.write(
      `[dry-run] would write ${configPath} (${existedBefore ? 'overwrite' : 'create'}, id ${idSource}: ${projectId})\n`,
    );
    process.stdout.write(
      `[dry-run] metadata source: ${metadataPath} (${metadataEntries.length} field${metadataEntries.length === 1 ? '' : 's'} merged into project)\n`,
    );
    process.stdout.write(scaffold);
    return;
  }

  fs.writeFileSync(configPath, scaffold);
  process.stdout.write(
    `${existedBefore ? 'Overwrote' : 'Created'} ${configPath} with canonical scaffold (id ${idSource}: ${projectId}).\n`,
  );
}

/**
 * Write a canonical JDH `myst.yml` scaffold, preserving an existing project id
 * and merging optional fields from `metadata.yml`.
 */
export const initMystConfigStep: PipelineStep = {
  id: 'initMystConfig',
  label: 'Init myst.yml from canonical scaffold',
  inputs: ['myst', 'project'],
  run: async (ctx) => {
    const o = stepOpts(ctx);
    await initMystConfig({
      configPath: 'myst.yml',
      metadataPath: o.metadataPath,
      dryRun: o.dryRun,
      cwd: o.cwd,
    });
  },
};
