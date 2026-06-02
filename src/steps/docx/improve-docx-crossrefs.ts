import path from 'node:path';
import type { PipelineStep } from '../../engine/types.js';
import { stepOpts } from '../../engine/step-context.js';
import { readUtf8, writeUtf8 } from '../shared/fs.js';
import { splitArticleFrontmatter, assembleArticleWithParts } from '../shared/myst-parts.js';

const DEFAULT_ARTICLE = 'article.md';

function collectLabels(content: string): Map<string, string> {
  const labels = new Map<string, string>();

  for (const m of content.matchAll(/:label:\s*(fig:[^\s\n]+)/gi)) {
    labels.set(m[1].toLowerCase(), m[1]);
  }
  for (const m of content.matchAll(/:label:\s*(table:[^\s\n]+)/gi)) {
    labels.set(m[1].toLowerCase(), m[1]);
  }

  return labels;
}

function figLabel(num: string, supplementary = false): string {
  const trimmed = num.trim();
  const digit = trimmed.match(/(?:S)?(\d+)/i)?.[1] ?? trimmed;
  if (/^S/i.test(trimmed) || supplementary) return `fig:s${digit}`;
  return `fig:${digit}`;
}

function tableLabel(num: string, supplementary = false): string {
  const trimmed = num.trim();
  const digit = trimmed.match(/(?:S)?(\d+)/i)?.[1] ?? trimmed;
  if (/^S/i.test(trimmed) || supplementary) return `table:s${digit}`;
  return `table:${digit}`;
}

function resolveLabel(labels: Map<string, string>, key: string): string {
  return labels.get(key.toLowerCase()) ?? key;
}

function isSupplementaryRef(match: string, num: string): boolean {
  return /^S/i.test(num) || /supplementary/i.test(match);
}

function processBody(body: string): { body: string; replacements: number } {
  // Prefer labels already emitted by figure/table conversion to keep casing stable.
  const labels = collectLabels(body);
  let replacements = 0;
  let result = body;

  const apply = (
    pattern: RegExp,
    replacer: (match: string, ...groups: string[]) => string,
  ) => {
    const next = result.replace(pattern, replacer);
    if (next !== result) replacements++;
    result = next;
  };

  result = result.replace(/\*\*Supplementary Table\s*\n(\d+)\*\*/gi, '**Supplementary Table $1**');

  apply(
    /\(\*\*(?:Supplementary\s+)?Table\.?\s+([^*]+?)\*\*\)/gi,
    (m, num) => `([](#${resolveLabel(labels, tableLabel(num, isSupplementaryRef(m, num)))}))`,
  );

  apply(
    /\*\*(?:Supplementary\s+)?(?:Fig\.|Figure)\.?\s+([^*]+?)\*\*/gi,
    (m, num) => `[](#${resolveLabel(labels, figLabel(num, isSupplementaryRef(m, num)))})`,
  );

  apply(
    /\*\*(?:Supplementary\s+)?Table\.?\s+([^*]+?)\*\*/gi,
    (m, num) => `[](#${resolveLabel(labels, tableLabel(num, isSupplementaryRef(m, num)))})`,
  );

  apply(
    /(?<![\[(#])(?:Supplementary\s+)?(?:Fig\.|Figure)\.?\s+((?:S)?\d+[A-Za-z0-9]*)/gi,
    (_m, num) => `[](#${resolveLabel(labels, figLabel(num, /^S/i.test(num)))})`,
  );

  apply(
    /(?<![\[(#])(?:Supplementary\s+)?Table\.?\s+((?:S)?\d+[A-Za-z0-9]*)/gi,
    (_m, num) => `[](#${resolveLabel(labels, tableLabel(num, /^S/i.test(num)))})`,
  );

  apply(
    /\(((?:[^)(]|fig\.|Figure|Table|Supplementary\s+Fig\.|Supplementary\s+Table)[^)]*)\)/gi,
    (_m, inner) => {
      const parts = inner.split(/\s*(?:and|,)\s*/i);
      const linked = parts.map((part) => {
        const fig = part.match(/^(?:Supplementary\s+)?(?:fig\.|figure)\.?\s+((?:S)?\d+[A-Za-z0-9]*)/i);
        if (fig) {
          return `[](#${resolveLabel(labels, figLabel(fig[1], /supplementary/i.test(part) || /^S/i.test(fig[1])))})`;
        }
        const tbl = part.match(/^(?:Supplementary\s+)?table\.?\s+((?:S)?\d+[A-Za-z0-9]*)/i);
        if (tbl) {
          return `[](#${resolveLabel(labels, tableLabel(tbl[1], /supplementary/i.test(part) || /^S/i.test(tbl[1])))})`;
        }
        return part.trim();
      });
      return `(${linked.filter(Boolean).join(' and ')})`;
    },
  );

  return { body: result, replacements };
}

async function improveDocxCrossrefs(options: {
  article?: string;
  dryRun: boolean;
  cwd: string;
}): Promise<void> {
  const articlePath = path.resolve(options.cwd, options.article ?? DEFAULT_ARTICLE);
  const md = readUtf8(articlePath);
  const { hasFrontmatter, fmLines, bodyLines } = splitArticleFrontmatter(md);
  const body = bodyLines.join('\n');
  const { body: newBody, replacements } = processBody(body);

  if (replacements === 0 && newBody === body) {
    process.stdout.write('Done. No cross-reference updates needed.\n');
    return;
  }

  const newMd = assembleArticleWithParts(hasFrontmatter, fmLines, newBody.split('\n'));
  writeUtf8(articlePath, newMd, options.dryRun);
  process.stdout.write(`Done. Updated ${replacements} cross-reference region(s).\n`);
}

export const improveDocxCrossrefsStep: PipelineStep = {
  id: 'improveDocxCrossrefs',
  label: 'Wire DOCX figure/table cross-references',
  run: async (ctx) => {
    const o = stepOpts(ctx);
    await improveDocxCrossrefs({ article: 'article.md', dryRun: o.dryRun, cwd: o.cwd });
  },
};
