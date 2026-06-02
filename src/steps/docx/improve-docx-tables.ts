import path from 'node:path';
import type { PipelineStep } from '../../engine/types.js';
import { stepOpts } from '../../engine/step-context.js';
import { readUtf8, writeUtf8 } from '../shared/fs.js';
import { splitArticleFrontmatter, assembleArticleWithParts } from '../shared/myst-parts.js';

const DEFAULT_ARTICLE = 'article.md';

const TABLE_HEADING =
  /^\*\*(?:(Supplementary)\s+)?Table\s+((?:S)?\d+[A-Za-z0-9]*)\s*[.:]\s*(.*)$/i;
const TABLE_S_LINE = /^Table\s+S(\d+)\s*$/i;
const KEY_RESOURCES_HEADING = /^Key resources table\s*$/i;

interface TableBlock {
  start: number;
  end: number;
  label: string;
  caption: string;
  tableBody: string;
}

function tableLabel(supplementary: string | undefined, numPart: string, custom?: string): string {
  if (custom) return custom;
  const cleaned = numPart.replace(/^S/i, '');
  if (supplementary || /^S/i.test(numPart)) return `table:s${cleaned.toLowerCase()}`;
  const n = cleaned.match(/\d+/)?.[0] ?? cleaned;
  return `table:${n}`;
}

function isTableLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith('|') || t.startsWith('+') || t.startsWith(':-') || t.startsWith('=:-');
}

function isTableBoundary(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (TABLE_HEADING.test(t)) return true;
  if (KEY_RESOURCES_HEADING.test(t)) return true;
  if (/^#{1,6}\s/.test(t)) return true;
  if (/^\*\*[A-Z]/.test(t) && !isTableLine(line)) return true;
  if (isImageLine(t)) return true;
  return false;
}

function isImageLine(line: string): boolean {
  return /^!\[[^\]]*\]\(/.test(line.trim());
}

function collectTableBody(lines: string[], start: number): { body: string; end: number } | null {
  if (!isTableLine(lines[start])) return null;
  const bodyLines: string[] = [];
  let end = start;
  for (let i = start; i < lines.length; i++) {
    const t = lines[i]?.trim() ?? '';
    if (!t) {
      if (bodyLines.length) {
        end = i - 1;
        break;
      }
      continue;
    }
    if (bodyLines.length && isTableBoundary(lines[i]) && !isTableLine(lines[i])) {
      end = i - 1;
      break;
    }
    if (isTableLine(lines[i])) {
      bodyLines.push(lines[i]);
      end = i;
      continue;
    }
    if (bodyLines.length) break;
  }
  if (!bodyLines.length) return null;
  return { body: bodyLines.join('\n').trim(), end };
}

function collectCaptionText(lines: string[], start: number): { caption: string; end: number } {
  const parts: string[] = [];
  const first = lines[start]?.trim() ?? '';
  const m = first.match(TABLE_HEADING);
  if (m?.[3]) parts.push(m[3].trim());

  let end = start;
  for (let j = start + 1; j < lines.length; j++) {
    const t = lines[j]?.trim() ?? '';
    if (!t) break;
    if (isTableLine(lines[j]) || isTableBoundary(lines[j])) break;
    parts.push(lines[j]);
    end = j;
  }
  return { caption: parts.join(' ').trim(), end };
}

function findTableBlocks(lines: string[]): TableBlock[] {
  const blocks: TableBlock[] = [];
  const used = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;

    if (KEY_RESOURCES_HEADING.test(lines[i]?.trim() ?? '')) {
      let tableStart = -1;
      for (let j = i + 1; j < lines.length; j++) {
        if (isTableLine(lines[j])) {
          tableStart = j;
          break;
        }
        if (lines[j]?.trim() && !isTableLine(lines[j])) break;
      }
      if (tableStart === -1) continue;
      const table = collectTableBody(lines, tableStart);
      if (!table) continue;
      blocks.push({
        start: i,
        end: table.end,
        label: 'table:key-resources',
        caption: 'Key resources table',
        tableBody: table.body,
      });
      for (let k = i; k <= table.end; k++) used.add(k);
      i = table.end;
      continue;
    }

    const tableS = lines[i]?.trim().match(TABLE_S_LINE);
    if (tableS) {
      // Pandoc can drop supplementary grids but leave the heading behind.
      blocks.push({
        start: i,
        end: i,
        label: `table:s${tableS[1]}`,
        caption: `Table S${tableS[1]}`,
        tableBody: `_Table data not present in DOCX export._`,
      });
      used.add(i);
      continue;
    }

    const heading = lines[i]?.trim().match(TABLE_HEADING);
    if (!heading) continue;

    const { caption, end: captionEnd } = collectCaptionText(lines, i);
    let tableStart = -1;
    for (let j = captionEnd + 1; j < Math.min(lines.length, captionEnd + 5); j++) {
      if (isTableLine(lines[j])) {
        tableStart = j;
        break;
      }
    }

    const label = tableLabel(heading[1], heading[2]);
    const title =
      caption ||
      heading[3]?.trim() ||
      `Table ${heading[2]}`;

    if (tableStart === -1) {
      // Caption-only supplementary table entry (no grid in source).
      blocks.push({
        start: i,
        end: captionEnd,
        label,
        caption: title,
        tableBody: `_Table data not present in DOCX export._`,
      });
      for (let k = i; k <= captionEnd; k++) used.add(k);
      i = captionEnd;
      continue;
    }

    const table = collectTableBody(lines, tableStart);
    if (!table) continue;
    blocks.push({
      start: i,
      end: table.end,
      label,
      caption: title,
      tableBody: table.body,
    });
    for (let k = i; k <= table.end; k++) used.add(k);
    i = table.end;
  }

  return blocks;
}

function toTableDirective(block: TableBlock): string[] {
  return [
    ':::{table} ' + block.caption,
    `:label: ${block.label}`,
    '',
    block.tableBody,
    ':::',
    '',
  ];
}

function processBody(bodyLines: string[]): { lines: string[]; count: number } {
  const blocks = findTableBlocks(bodyLines);
  if (!blocks.length) return { lines: bodyLines, count: 0 };

  // Replace from the bottom so earlier indices stay valid.
  blocks.sort((a, b) => b.start - a.start);
  const out = [...bodyLines];
  for (const block of blocks) {
    out.splice(block.start, block.end - block.start + 1, ...toTableDirective(block));
  }
  return { lines: out, count: blocks.length };
}

async function improveDocxTables(options: {
  article?: string;
  dryRun: boolean;
  cwd: string;
}): Promise<void> {
  const articlePath = path.resolve(options.cwd, options.article ?? DEFAULT_ARTICLE);
  const md = readUtf8(articlePath);
  const { hasFrontmatter, fmLines, bodyLines } = splitArticleFrontmatter(md);
  const { lines: newBody, count } = processBody(bodyLines);

  if (count === 0) {
    process.stdout.write('Done. No DOCX table blocks found; no changes.\n');
    return;
  }

  const newMd = assembleArticleWithParts(hasFrontmatter, fmLines, newBody);
  writeUtf8(articlePath, newMd, options.dryRun);
  process.stdout.write(`Done. Converted ${count} table block(s) to {{table}} directives.\n`);
}

export const improveDocxTablesStep: PipelineStep = {
  id: 'improveDocxTables',
  label: 'Convert DOCX tables to MyST table directives',
  run: async (ctx) => {
    const o = stepOpts(ctx);
    await improveDocxTables({ article: 'article.md', dryRun: o.dryRun, cwd: o.cwd });
  },
};
