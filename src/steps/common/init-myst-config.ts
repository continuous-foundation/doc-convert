import crypto from 'node:crypto';
import path from 'node:path';
import type { PipelineStep } from '../../engine/types.js';
import { fileExists } from '../../engine/context.js';
import { stepOpts } from '../../engine/step-context.js';
import { readUtf8, writeUtf8 } from '../shared/fs.js';
import { readProjectIdFromConfig } from '../shared/myst-config.js';

const DEFAULT_CONFIG = 'myst.yml';

type MetadataEntry = { key: string; rawValue: string };

function readMetadataEntries(metadataPath: string): MetadataEntry[] {
  if (!fileExists(metadataPath)) return [];
  let content: string;
  try {
    content = readUtf8(metadataPath);
  } catch {
    return [];
  }

  const entries: MetadataEntry[] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*?)\s*$/);
    if (!m) continue;
    if (!m[2]) continue;
    entries.push({ key: m[1], rawValue: m[2] });
  }
  return entries;
}

function buildScaffold(projectId: string, metadataEntries: MetadataEntry[]): string {
  const reservedProjectKeys = new Set(['id', 'open_access', 'license', 'toc']);
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
    '  toc:',
    '    - file: article.md',
    'site:',
    '  template: book-theme',
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
  const existingId = readProjectIdFromConfig(configPath);
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
      `[dry-run] metadata: ${metadataPath} (${metadataEntries.length} field(s))\n`,
    );
    process.stdout.write(scaffold);
    return;
  }

  writeUtf8(configPath, scaffold, false);
  process.stdout.write(
    `${existedBefore ? 'Overwrote' : 'Created'} ${path.relative(options.cwd, configPath)} (id ${idSource}).\n`,
  );
}

export const initMystConfigStep: PipelineStep = {
  id: 'initMystConfig',
  label: 'Init myst.yml from canonical scaffold',
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
