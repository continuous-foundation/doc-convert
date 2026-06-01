import fs from 'node:fs';
import path from 'node:path';
import type { PipelineStep } from '../../engine/types.js';
import { stepOpts } from '../../engine/step-context.js';
import { splitArticleFrontmatter, assembleArticleWithParts } from '../shared/myst-parts.js';

const DEFAULT_ARTICLE = 'article.md';

function readUtf8(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

function writeUtf8(p: string, content: string, dryRun: boolean): void {
  if (dryRun) return;
  fs.writeFileSync(p, content, 'utf8');
}

function cleanLine(line: string): string {
  let s = line;

  // [[text]{.underline}](url) -> [text](url)
  s = s.replace(/\[\[([^\]]+)\]\{\.underline\}\]\(([^)]+)\)/g, '[$1]($2)');

  // [**[Supplementary File N]{.underline}**](url) -> [Supplementary File N](url)
  s = s.replace(/\[\*\*\[([^\]]+)\](?:\{\.underline\})?\*\*\]\(([^)]+)\)/g, '[$1]($2)');

  // [text]{.underline} -> **text**
  s = s.replace(/\[([^\]]+)\]\{\.underline\}/g, '**$1**');

  // Remove other pandoc attribute spans
  s = s.replace(/\{\.(?:underline|mark)\}/g, '');

  // Trailing artifact on keywords lines
  s = s.replace(/\*\*\\?\*\*?\s*$/, '');

  return s;
}

function normalizeBracketHeadings(lines: string[]): string[] {
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const single = line.match(/^\*\*\[(.+)\]\**\s*$/);
    if (single) {
      out.push(`### ${single[1].trim()}`);
      i++;
      continue;
    }

    const open = line.match(/^\*\*\[(.+)$/);
    if (open && !/\](?:\{\.underline\})?\**\s*$/.test(line)) {
      const titleParts = [open[1].trim()];
      let j = i + 1;
      let closed = false;
      while (j < lines.length && j < i + 10) {
        const next = lines[j];
        const closeMatch = next.match(/^(.+?)\](?:\{\.underline\})?\**\s*$/);
        if (closeMatch) {
          titleParts.push(closeMatch[1].trim());
          const title = titleParts
            .join(' ')
            .replace(/\{[^}]+\}/g, '')
            .replace(/\*+/g, '')
            .trim();
          out.push(`### ${title}`);
          i = j + 1;
          closed = true;
          break;
        }
        titleParts.push(next.trim());
        j++;
      }
      if (!closed) {
        out.push(cleanLine(line));
        i++;
      }
      continue;
    }

    out.push(cleanLine(line));
    i++;
  }

  return out;
}

function normalizeMultilineLinks(lines: string[]): string[] {
  const text = lines.join('\n');
  const joined = text.replace(
    /\[\*\*\[Supplementary File\s*\n([^\]]+)\](?:\{\.underline\})?\*\*\]\(([^)]+)\)/gi,
    '[$1]($2)',
  );
  return joined.split('\n');
}

function cleanBody(lines: string[]): string[] {
  const normalized = normalizeBracketHeadings(normalizeMultilineLinks(lines));
  const out: string[] = [];

  for (const line of normalized) {
    const t = line.trim();
    if (t === '###' || t === '##' || t === '#') continue;
    out.push(line);
  }

  return out;
}

function cleanFrontmatterParts(fmLines: string[]): string[] {
  const out = [...fmLines];
  let i = 0;

  while (i < out.length) {
    const partMatch = out[i].match(/^(\s{2})([a-z_]+):\s*\|\s*$/);
    if (!partMatch) {
      i++;
      continue;
    }

    const indent = `${partMatch[1]}  `;
    const start = i + 1;
    let end = start;
    while (
      end < out.length &&
      (out[end].startsWith(indent) ||
        (out[end] === '' && end + 1 < out.length && out[end + 1].startsWith(indent)))
    ) {
      end++;
    }

    const contentLines = out
      .slice(start, end)
      .map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l));
    const cleaned = contentLines.map((l) => cleanLine(l)).join('\n');
    const newLines = cleaned.split('\n').map((l) => `${indent}${l}`);
    out.splice(start, end - start, ...newLines);
    i = start + newLines.length;
  }

  return out;
}

async function cleanPandocArtifacts(options: {
  article?: string;
  dryRun: boolean;
  cwd: string;
}): Promise<void> {
  const articlePath = path.resolve(options.cwd, options.article ?? DEFAULT_ARTICLE);
  const md = readUtf8(articlePath);
  const { hasFrontmatter, fmLines, bodyLines } = splitArticleFrontmatter(md);
  const newFmLines = cleanFrontmatterParts(fmLines);
  const newBody = cleanBody(bodyLines);
  const changed =
    newBody.join('\n') !== bodyLines.join('\n') || newFmLines.join('\n') !== fmLines.join('\n');

  if (!changed) {
    process.stdout.write('Done. No Pandoc artifacts found; no changes.\n');
    return;
  }

  const newMd = assembleArticleWithParts(hasFrontmatter, newFmLines, newBody);
  writeUtf8(articlePath, newMd, options.dryRun);
  process.stdout.write('Done. Cleaned Pandoc conversion artifacts.\n');
}

export const cleanPandocArtifactsStep: PipelineStep = {
  id: 'cleanPandocArtifacts',
  label: 'Clean Pandoc conversion artifacts',
  inputs: ['markdown'],
  run: async (ctx) => {
    const o = stepOpts(ctx);
    await cleanPandocArtifacts({ article: 'article.md', dryRun: o.dryRun, cwd: o.cwd });
  },
};
