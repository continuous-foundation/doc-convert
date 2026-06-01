import fs from 'node:fs';
import path from 'node:path';
import type { PipelineStep } from '../../engine/types.js';
import { stepOpts } from '../../engine/step-context.js';
import { splitArticleFrontmatter, assembleArticleWithParts } from '../shared/myst-parts.js';

const DEFAULT_ARTICLE = 'article.md';

const IMAGE_START = /^!\[/;

function extractImageFromLines(lines: string[], start: number): { path: string; end: number } | null {
  let chunk = '';
  let end = start;
  for (let i = start; i < Math.min(lines.length, start + 4); i++) {
    chunk += (chunk ? ' ' : '') + lines[i].trim();
    end = i;
    const mAttr = chunk.match(/^!\[[^\]]*\]\(([^)\s]+)\)/);
    if (mAttr) {
      // Include pandoc attribute block on following lines: {width="..." height="..."}
      while (end + 1 < lines.length && /^\{[^}]*$/.test(lines[end + 1]?.trim() ?? '')) {
        end++;
      }
      return { path: mAttr[1], end };
    }
  }
  return null;
}

function isImageLine(line: string): boolean {
  return IMAGE_START.test(line.trim());
}

const FIGURE_HEADING =
  /^\*\*(?:(Supplementary)\s+)?(?:(Figure|Fig\.))\s+((?:S)?\d+[A-Za-z0-9]*)\s*[.:]\s*(.*)$/i;

interface FigureBlock {
  start: number;
  end: number;
  imagePath: string;
  label: string;
  caption: string;
}

function readUtf8(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

function writeUtf8(p: string, content: string, dryRun: boolean): void {
  if (dryRun) return;
  fs.writeFileSync(p, content, 'utf8');
}

function figLabelFromMatch(supplementary: string | undefined, numPart: string): string {
  const digit = numPart.match(/(?:S)?(\d+)/i)?.[1] ?? numPart;
  if (supplementary || /^S/i.test(numPart)) return `fig:s${digit}`;
  return `fig:${digit}`;
}

function stripFigurePrefix(caption: string): string {
  return caption
    .replace(
      /^\*\*(?:Supplementary\s+)?(?:Figure|Fig\.)\s+(?:S)?\d+[A-Za-z0-9]*\s*[.:]\s*/i,
      '',
    )
    .replace(/^\*\*/, '')
    .replace(/\.\*\*(?=\s*$|\s*\n)/gm, '.')
    .replace(/\*\*\s*$/gm, '')
    .trim();
}


function captionHeadingAt(line: string): { label: string; captionStart: string } | null {
  const t = line.trim();
  const m = t.match(FIGURE_HEADING);
  if (!m) return null;
  const label = figLabelFromMatch(m[1], m[3]);
  const rest = (m[4] ?? '').trim();
  const fullCaptionStart = rest ? `**${rest}` : t;
  return { label, captionStart: rest || t.replace(FIGURE_HEADING, '').trim() || t };
}

function isNewFigureCaption(line: string, currentLabel: string): boolean {
  const hit = captionHeadingAt(line);
  if (!hit) return false;
  return hit.label !== currentLabel;
}

function isCaptionBoundary(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (isImageLine(line)) return true;
  if (/^#{1,6}\s/.test(t)) return true;
  if (/^\*\*\[(?!Figure|Fig\.|Supplementary)/i.test(t)) return true;
  if (FIGURE_HEADING.test(t)) return true;
  return false;
}

function collectCaption(lines: string[], captionLineIdx: number, label: string): { text: string; end: number } {
  const parts: string[] = [];
  const first = lines[captionLineIdx]?.trim() ?? '';
  const m = first.match(FIGURE_HEADING);
  if (m) {
    const rest = (m[4] ?? '').trim();
    if (rest) parts.push(rest.endsWith('**') ? rest : rest);
    else parts.push(first);
  }

  let end = captionLineIdx;
  let sawPanel = false;

  for (let j = captionLineIdx + 1; j < lines.length; j++) {
    const raw = lines[j];
    const t = raw?.trim() ?? '';

    if (isCaptionBoundary(raw)) break;

    if (!t) {
      parts.push('');
      end = j;
      continue;
    }

    if (/^\*\*[a-z][,~]/i.test(t) || /^\*\*\([A-Za-z]\)/.test(t)) {
      sawPanel = true;
    }

    // Prose paragraph after panels = end of caption block.
    if (sawPanel && !/^\*\*/.test(t) && /^[A-Z]/.test(t)) break;

    parts.push(raw);
    end = j;
  }

  const rawCaption = parts.join('\n').trim();
  return { text: stripFigurePrefix(rawCaption), end };
}

function findFigureBlocks(lines: string[]): FigureBlock[] {
  const blocks: FigureBlock[] = [];
  const used = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;

    if (isImageLine(lines[i])) {
      const img = extractImageFromLines(lines, i);
      if (!img) continue;

      let captionIdx = -1;
      for (let j = img.end + 1; j < Math.min(lines.length, img.end + 4); j++) {
        if (captionHeadingAt(lines[j])) {
          captionIdx = j;
          break;
        }
      }
      if (captionIdx === -1) continue;

      const { label } = captionHeadingAt(lines[captionIdx])!;
      const { text, end: captionEnd } = collectCaption(lines, captionIdx, label);
      blocks.push({
        start: i,
        end: captionEnd,
        imagePath: img.path,
        label,
        caption: text,
      });
      for (let k = i; k <= captionEnd; k++) used.add(k);
      i = captionEnd;
      continue;
    }

    const heading = captionHeadingAt(lines[i]);
    if (!heading) continue;

    let imageIdx = -1;
    let imagePath = '';
    for (let j = i + 1; j < lines.length; j++) {
      if (isImageLine(lines[j])) {
        const img = extractImageFromLines(lines, j);
        if (img) {
          imageIdx = j;
          imagePath = img.path;
          break;
        }
      }
      if (captionHeadingAt(lines[j]) && j !== i) break;
      if (j > i + 80) break;
    }
    if (imageIdx === -1) continue;

    const imgEnd = extractImageFromLines(lines, imageIdx)!.end;
    const { text, end: captionEnd } = collectCaption(lines, i, heading.label);
    const blockEnd = Math.max(imgEnd, captionEnd);
    blocks.push({
      start: i,
      end: blockEnd,
      imagePath,
      label: heading.label,
      caption: text,
    });
    for (let k = i; k <= blockEnd; k++) used.add(k);
    i = blockEnd;
  }

  return blocks;
}

function toFigureDirective(block: FigureBlock): string[] {
  return [
    '```{figure} ' + block.imagePath,
    `:label: ${block.label}`,
    '',
    block.caption,
    '```',
    '',
  ];
}

function processBody(bodyLines: string[]): { lines: string[]; count: number } {
  const blocks = findFigureBlocks(bodyLines);
  if (!blocks.length) return { lines: bodyLines, count: 0 };

  blocks.sort((a, b) => b.start - a.start);
  const out = [...bodyLines];
  for (const block of blocks) {
    out.splice(block.start, block.end - block.start + 1, ...toFigureDirective(block));
  }
  return { lines: out, count: blocks.length };
}

async function improveDocxFigures(options: {
  article?: string;
  dryRun: boolean;
  cwd: string;
}): Promise<void> {
  const articlePath = path.resolve(options.cwd, options.article ?? DEFAULT_ARTICLE);
  const md = readUtf8(articlePath);
  const { hasFrontmatter, fmLines, bodyLines } = splitArticleFrontmatter(md);
  const { lines: newBody, count } = processBody(bodyLines);

  if (count === 0) {
    process.stdout.write('Done. No DOCX figure blocks found; no changes.\n');
    return;
  }

  const newMd = assembleArticleWithParts(hasFrontmatter, fmLines, newBody);
  writeUtf8(articlePath, newMd, options.dryRun);
  process.stdout.write(`Done. Converted ${count} figure block(s) to {{figure}} directives.\n`);
}

export const improveDocxFiguresStep: PipelineStep = {
  id: 'improveDocxFigures',
  label: 'Wrap DOCX images in MyST figure directives',
  inputs: ['markdown'],
  run: async (ctx) => {
    const o = stepOpts(ctx);
    await improveDocxFigures({ article: 'article.md', dryRun: o.dryRun, cwd: o.cwd });
  },
};
