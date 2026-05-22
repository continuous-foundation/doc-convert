/**
 * Shared helpers for writing MyST document parts into page YAML frontmatter.
 * Used by jupytext region extraction and (future) heading-based extraction.
 */

/**
 * Known MyST "document parts" (including aliases).
 *
 * Source: https://mystmd.org/guide/document-parts#known-document-parts
 */
export const KNOWN_MYST_PARTS = new Set<string>([
  'abstract',
  'summary',
  'plain_language_summary',
  'lay_summary',
  'keypoints',
  'dedication',
  'epigraph',
  'quote',
  'data_availability',
  'availability',
  'acknowledgments',
  'ack',
  'acknowledgements',
]);

export interface SplitArticleFrontmatter {
  hasFrontmatter: boolean;
  fmLines: string[];
  bodyLines: string[];
}

export function splitArticleFrontmatter(md: string): SplitArticleFrontmatter {
  const lines = md.split('\n');
  if (lines[0] !== '---') {
    return { hasFrontmatter: false, fmLines: [], bodyLines: lines };
  }

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      end = i;
      break;
    }
  }

  if (end === -1) {
    return { hasFrontmatter: false, fmLines: [], bodyLines: lines };
  }

  return {
    hasFrontmatter: true,
    fmLines: lines.slice(1, end),
    bodyLines: lines.slice(end + 1),
  };
}

export function partitionPartsByKind(
  parts: Record<string, string>,
): { knownParts: Record<string, string>; customParts: Record<string, string> } {
  const knownParts: Record<string, string> = {};
  const customParts: Record<string, string> = {};

  for (const [key, content] of Object.entries(parts)) {
    if (KNOWN_MYST_PARTS.has(key)) knownParts[key] = content;
    else customParts[key] = content;
  }

  return { knownParts, customParts };
}

function escapeRegExp(s: string): string {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removeRootKeyBlock(fmLines: string[], key: string): void {
  const keyRe = new RegExp(`^${escapeRegExp(key)}:\\s*(.*)$`);
  for (let i = 0; i < fmLines.length; i++) {
    const line = fmLines[i];
    if (!keyRe.test(line)) continue;

    fmLines.splice(i, 1);

    while (i < fmLines.length && (/^\s+/.test(fmLines[i]) || fmLines[i] === '')) {
      fmLines.splice(i, 1);
    }

    return;
  }
}

function ensurePartsRoot(fmLines: string[]): number {
  const idx = fmLines.findIndex((l) => /^parts:\s*$/.test(l));
  if (idx !== -1) return idx;
  if (fmLines.length && fmLines[fmLines.length - 1].trim() !== '') fmLines.push('');
  fmLines.push('parts:');
  return fmLines.length - 1;
}

function removeNestedPartKey(fmLines: string[], key: string): void {
  const partsIdx = fmLines.findIndex((l) => /^parts:\s*$/.test(l));
  if (partsIdx === -1) return;

  const keyRe = new RegExp(`^\\s{2}${escapeRegExp(key)}:\\s*(.*)$`);
  let partsEnd = fmLines.length;
  for (let i = partsIdx + 1; i < fmLines.length; i++) {
    if (/^\S/.test(fmLines[i])) {
      partsEnd = i;
      break;
    }
  }

  for (let i = partsIdx + 1; i < partsEnd; i++) {
    if (!keyRe.test(fmLines[i])) continue;

    fmLines.splice(i, 1);
    partsEnd--;

    while (i < partsEnd && (/^\s{4,}\S/.test(fmLines[i]) || fmLines[i] === '')) {
      fmLines.splice(i, 1);
      partsEnd--;
    }

    return;
  }
}

function yamlBlockScalarLines(
  key: string,
  content: string,
  baseIndentSpaces: number,
): string[] {
  const baseIndent = ' '.repeat(baseIndentSpaces);
  const contentIndent = ' '.repeat(baseIndentSpaces + 2);
  const lines = String(content ?? '').split('\n');

  return [`${baseIndent}${key}: |`, ...lines.map((l) => `${contentIndent}${l}`)];
}

/** Merge extracted parts into page frontmatter lines (mutates a copy via return). */
export function applyPartsToFrontmatter(
  fmLines: string[],
  knownParts: Record<string, string>,
  customParts: Record<string, string>,
): void {
  for (const [k, v] of Object.entries(knownParts)) {
    removeRootKeyBlock(fmLines, k);
    customParts[k] = v;
  }

  for (const k of Object.keys(customParts)) {
    removeNestedPartKey(fmLines, k);
  }

  const customKeys = Object.keys(customParts);
  if (!customKeys.length) return;

  const partsIdx = ensurePartsRoot(fmLines);
  let partsEnd = fmLines.length;
  for (let i = partsIdx + 1; i < fmLines.length; i++) {
    if (/^\S/.test(fmLines[i])) {
      partsEnd = i;
      break;
    }
  }

  const partBlocks: string[] = [];
  for (const k of customKeys) {
    partBlocks.push(...yamlBlockScalarLines(k, customParts[k], 2), '');
  }
  fmLines.splice(partsEnd, 0, ...partBlocks);
}

/** Remove line intervals from a markdown body (e.g. stripped region blocks). */
export function removeBodyLineIntervals(
  bodyLines: string[],
  intervals: Array<{ start: number; end: number }>,
): string[] {
  if (!intervals.length) return bodyLines;

  const ints = intervals
    .map((x) => ({ start: x.start, end: x.end }))
    .sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [];
  for (const it of ints) {
    const last = merged[merged.length - 1];
    if (!last || it.start > last.end + 1) merged.push({ start: it.start, end: it.end });
    else last.end = Math.max(last.end, it.end);
  }

  const out: string[] = [];
  let cursor = 0;
  for (const it of merged) {
    out.push(...bodyLines.slice(cursor, it.start));
    cursor = it.end + 1;
  }
  out.push(...bodyLines.slice(cursor));
  return out;
}

/** Rebuild `article.md` with updated frontmatter parts and body lines. */
export function assembleArticleWithParts(
  hasFrontmatter: boolean,
  fmLines: string[],
  bodyLines: string[],
): string {
  const newFmLines = [...fmLines];
  const newMdLines = hasFrontmatter
    ? ['---', ...newFmLines, '---', ...bodyLines]
    : ['---', ...newFmLines, '---', '', ...bodyLines];
  return newMdLines.join('\n');
}
