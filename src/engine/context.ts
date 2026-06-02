import fs from 'node:fs';
import path from 'node:path';
import { loadDocConvertConfig } from '../config/doc-convert-config.js';
import { docxRuleset } from '../rulesets/docx.js';
import type { ConvertOptions, RunContext } from './types.js';

const DEFAULT_WORKDIR = '_improved';

export function fileExists(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveInputPath(input: string): string {
  return path.resolve(process.cwd(), input);
}

export function buildRunContext(inputAbs: string, options: ConvertOptions): RunContext {
  const projectRoot = path.resolve(options.projectRoot ?? path.dirname(inputAbs));
  const workdir = options.workdir ?? DEFAULT_WORKDIR;
  const workdirAbs = path.isAbsolute(workdir)
    ? workdir
    : path.resolve(projectRoot, workdir);

  const stepConfig = loadDocConvertConfig(process.cwd(), docxRuleset);

  return {
    inputAbs,
    projectRoot,
    workdir,
    workdirAbs,
    articleMd: path.join(workdirAbs, 'article.md'),
    mystYml: path.join(workdirAbs, 'myst.yml'),
    options,
    stepConfig,
  };
}

export function parseConvertOptions(opts: {
  dryRun?: boolean;
  workdir?: string;
  rorLookup?: boolean;
  noRorLookup?: boolean;
  rorMinScore?: string;
  projectRoot?: string;
}): ConvertOptions {
  const rorMinScore = opts.rorMinScore != null ? Number(opts.rorMinScore) : 0.8;
  if (!Number.isFinite(rorMinScore) || rorMinScore < 0 || rorMinScore > 1) {
    throw new Error(`--ror-min-score must be between 0 and 1 (got ${opts.rorMinScore})`);
  }

  return {
    dryRun: Boolean(opts.dryRun),
    workdir: opts.workdir ?? DEFAULT_WORKDIR,
    rorLookup: opts.noRorLookup ? false : opts.rorLookup !== false,
    rorMinScore,
    projectRoot: opts.projectRoot,
  };
}

export function assertDocxInput(inputAbs: string): void {
  const ext = path.extname(inputAbs).toLowerCase();
  if (ext !== '.docx') {
    throw new Error(
      `Unsupported input "${path.basename(inputAbs)}". doc-convert only accepts .docx files.`,
    );
  }
}
