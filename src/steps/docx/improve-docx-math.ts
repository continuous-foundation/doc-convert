import path from 'node:path';
import type { PipelineStep } from '../../engine/types.js';
import { stepOpts } from '../../engine/step-context.js';
import { readUtf8, writeUtf8 } from '../shared/fs.js';
import { splitArticleFrontmatter, assembleArticleWithParts } from '../shared/myst-parts.js';
import {
  buildMarkdownSkipRanges,
  inSkipRange,
} from '../shared/markdown-skip-ranges.js';

const DEFAULT_ARTICLE = 'article.md';

function wrapDisplayMathBlocks(body: string): { body: string; count: number } {
  // Do not relabel math already inside directives or fenced examples.
  const skip = buildMarkdownSkipRanges(body);
  const displayRe = /\$\$([\s\S]*?)\$\$/g;
  let eqNum = 0;
  let count = 0;

  const result = body.replace(displayRe, (match, inner, offset) => {
    if (inSkipRange(skip, offset)) return match;
    const trimmed = String(inner).trim();
    if (!trimmed) return match;
    eqNum++;
    count++;
    return ['```{math}', `:label: eq:${eqNum}`, '', trimmed, '```', ''].join('\n');
  });

  return { body: result, count };
}

function normalizeGeneSuperscripts(line: string): string {
  // AvrBs2^H319A^ -> AvrBs2$^{H319A}$
  return line.replace(/(\*?[A-Za-z0-9]+(?:\.[A-Za-z]+)?)\^([A-Za-z0-9]+)\^/g, '$1$^{$2}$');
}

function normalizeBodyLines(lines: string[]): { lines: string[]; geneFixes: number } {
  let geneFixes = 0;
  const out = lines.map((line) => {
    if (line.includes('```') || line.includes(':label:')) return line;
    const next = normalizeGeneSuperscripts(line);
    if (next !== line) geneFixes++;
    return next;
  });
  return { lines: out, geneFixes };
}

async function improveDocxMath(options: {
  article?: string;
  dryRun: boolean;
  cwd: string;
}): Promise<void> {
  const articlePath = path.resolve(options.cwd, options.article ?? DEFAULT_ARTICLE);
  const md = readUtf8(articlePath);
  const { hasFrontmatter, fmLines, bodyLines } = splitArticleFrontmatter(md);
  const body = bodyLines.join('\n');

  const { body: withMath, count: mathCount } = wrapDisplayMathBlocks(body);
  const { lines: normalized, geneFixes } = normalizeBodyLines(withMath.split('\n'));

  if (mathCount === 0 && geneFixes === 0) {
    process.stdout.write('Done. No DOCX math normalization needed.\n');
    return;
  }

  const newMd = assembleArticleWithParts(hasFrontmatter, fmLines, normalized);
  writeUtf8(articlePath, newMd, options.dryRun);
  process.stdout.write(
    `Done. Labeled ${mathCount} display equation(s); normalized ${geneFixes} gene/superscript line(s).\n`,
  );
}

export const improveDocxMathStep: PipelineStep = {
  id: 'improveDocxMath',
  label: 'Normalize DOCX math markup',
  run: async (ctx) => {
    const o = stepOpts(ctx);
    await improveDocxMath({ article: 'article.md', dryRun: o.dryRun, cwd: o.cwd });
  },
};
