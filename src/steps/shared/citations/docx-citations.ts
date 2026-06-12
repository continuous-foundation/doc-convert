import fs from 'node:fs';
import path from 'node:path';
import { logStep } from '../../../engine/step-log.js';
import { ensureMystBibliography } from '../myst-bibliography.js';
import { resolveProjectConfigPath } from '../myst-config.js';
import {
  splitArticleFrontmatter,
  assembleArticleWithParts,
} from '../myst-parts.js';

export type CitationDialect = 'paperpile' | 'superscript' | 'italic-paren' | 'none';

export interface ParsedReference {
  number: number;
  text: string;
  citeId?: string;
}

export interface CitationMaps {
  numToKey: Map<number, string>;
  citeIdToKey: Map<string, string>;
}

const REF_HEADING =
  /^(?:#{1,3}\s+)?(?:\*\*)?(?:REFERENCES|References(?:\s+and\s+Notes)?)(?:\*\*)?\s*$/i;

function escapeBibtexValue(v: string): string {
  return v
    .replace(/\\/g, '\\\\')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')
    .replace(/%/g, '\\%')
    .replace(/&/g, '\\&')
    .replace(/_/g, '\\_')
    .replace(/#/g, '\\#');
}

function renderBibtexEntry(bibType: string, citekey: string, fields: Record<string, string>): string {
  const orderedKeys = [
    'author',
    'title',
    'journal',
    'year',
    'volume',
    'pages',
    'doi',
    'url',
    'note',
  ];
  const restKeys = Object.keys(fields).filter((k) => !orderedKeys.includes(k)).sort();
  const keys = [...orderedKeys.filter((k) => fields[k]), ...restKeys];
  const lines = keys.map((k) => `  ${k} = {${escapeBibtexValue(fields[k])}},`);
  if (lines.length) lines[lines.length - 1] = lines[lines.length - 1].replace(/},$/, '}');
  return `@${bibType}{${citekey},\n${lines.join('\n')}\n}\n`;
}

function normalizeKeyToken(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '')
    .trim();
}

function stripMd(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\\([.[\]&%_#~^])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// A token is an author name when it is one-or-more initials ("J. G.") followed
// by a capitalized surname, e.g. "G. S. X. E. Jefferis", "Y.-J. Kim", "Á. S. Díez".
// Consortium / project-team bylines and "et al." are also treated as authors.
const AUTHOR_TOKEN = /^(?:\p{Lu}\.[ -]?){1,8}(?:\p{Lu}[\p{L}'’.-]*\s*)+$/u;
function looksLikeAuthor(token: string): boolean {
  const t = token.trim();
  if (!t) return false;
  if (/^et al\.?$/i.test(t)) return true;
  if (/consortium|project team|flywire/i.test(t)) return true;
  return AUTHOR_TOKEN.test(t);
}

// Parse a Science/AAAS-style reference: "A1, A2, …, An, Title. *Journal* **vol**, pages (year)."
// The author list, the title, and the trailing journal/volume/pages block are each delimited by
// markdown markers and punctuation rather than a single comma, so we anchor on those.
function parseReferenceFields(text: string): Record<string, string> {
  const fields: Record<string, string> = {};

  const doi = text.match(
    /\b(?:doi:\s*)?(?:https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,}\/\S+)/i,
  )?.[1];

  // Journal (italic) + volume (bold) + pages, ending at the (year) marker.
  const jvp = text.match(
    /\*([^*]+)\*\s+\*\*([^*]+)\*\*,?\s*([^*()]*?)\s*\(\s*(\d{4})\s*\)/,
  );
  let headEnd = text.length;
  let year: string | undefined;
  if (jvp) {
    fields.journal = stripMd(jvp[1]);
    fields.volume = stripMd(jvp[2]);
    const pages = stripMd(jvp[3]).replace(/[.,;]\s*$/, '');
    if (pages) fields.pages = pages;
    year = jvp[4];
    headEnd = jvp.index!;
  }
  if (!year) {
    const years = [...text.matchAll(/\((\d{4})\)/g)].map((m) => m[1]);
    year = years.length ? years[years.length - 1] : text.match(/\b(?:19|20)\d{2}\b/)?.[0];
    const yp = text.search(/\(\s*\d{4}\s*\)/);
    if (yp > 0) headEnd = Math.min(headEnd, yp);
  }

  // Everything before the journal/year is the author list followed by the title.
  const head = text.slice(0, headEnd).replace(/\\?\[Preprint\\?\]/gi, '');
  const tokens = stripMd(head)
    .split(/,\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  let lastAuthor = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (looksLikeAuthor(tokens[i])) lastAuthor = i;
  }

  if (lastAuthor >= 0) {
    const authors = tokens
      .slice(0, lastAuthor + 1)
      .map((t) => (/^et al\.?$/i.test(t) ? 'others' : t))
      .filter(Boolean);
    fields.author = authors.join(' and ');
    const title = tokens
      .slice(lastAuthor + 1)
      .join(', ')
      .replace(/\.\s*$/, '')
      .trim();
    if (title) fields.title = title;
  } else if (tokens.length) {
    fields.title = tokens.join(', ').replace(/\.\s*$/, '').trim();
  }

  if (year) fields.year = year;
  if (doi) fields.doi = doi.replace(/[).]+$/, '');
  if (!fields.author && !fields.title) {
    const plain = stripMd(text).slice(0, 2000);
    if (plain) fields.note = plain;
  }
  return fields;
}

function generateCitekey(ref: ParsedReference, fields: Record<string, string>): string {
  const year = fields.year ? normalizeKeyToken(fields.year) : 'nd';
  const author = fields.author ?? '';
  const family = author.split(/,|\s+and\s+/i)[0]?.trim() ?? '';
  const token = normalizeKeyToken(family.split(/\s+/).pop() ?? '') || `ref${ref.number}`;
  return `${token}${year}`;
}

function dedupeCitekeys(refs: ParsedReference[], fieldsByNum: Map<number, Record<string, string>>): Map<number, string> {
  const used = new Set<string>();
  const numToKey = new Map<number, string>();

  for (const ref of refs) {
    const fields = fieldsByNum.get(ref.number) ?? {};
    let base = generateCitekey(ref, fields);
    if (!base || base === 'nd') base = `ref${ref.number}`;

    let candidate = base;
    let suffix = 0;
    while (used.has(candidate)) {
      suffix++;
      candidate = `${base}${String.fromCharCode('a'.charCodeAt(0) + suffix - 1)}`;
    }
    used.add(candidate);
    numToKey.set(ref.number, candidate);
  }

  return numToKey;
}

export function detectCitationDialect(content: string): CitationDialect {
  if (/paperpile\.com\/c\//i.test(content)) return 'paperpile';
  if (/\(\*\d+\*/.test(content)) return 'italic-paren';
  if (/\^[\d,\-]+\^/.test(content) || /\$\^\{[\d,\-]+\}\$/.test(content)) return 'superscript';
  return 'none';
}

function extractPaperpileId(text: string): string | undefined {
  const ids = [...text.matchAll(/paperpile\.com\/(?:b|c)\/[^/\s]+\/([^/\s\])+"+]+)/gi)].map(
    (m) => m[1],
  );
  if (!ids.length) return undefined;
  return ids[ids.length - 1];
}

function splitReferenceEntries(block: string, dialect: CitationDialect): ParsedReference[] {
  const refs: ParsedReference[] = [];
  const re = /(?:^|\n)(\d+)\\?\.\s+/g;
  const starts: Array<{ num: number; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    starts.push({ num: Number(m[1]), index: m.index + (m[0].startsWith('\n') ? 1 : 0) });
  }

  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1].index : block.length;
    const chunk = block.slice(start.index, end).trim();
    const text = chunk.replace(/^\d+\\?\.\s+/, '').trim();
    const citeId = dialect === 'paperpile' ? extractPaperpileId(chunk) : undefined;
    refs.push({ number: start.num, text, citeId });
  }

  return refs;
}

export function findReferencesBlock(
  body: string,
): { headingLine: number; endLine: number; text: string } | null {
  const lines = body.split('\n');
  let headingIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (REF_HEADING.test(lines[i].trim())) {
      headingIdx = i;
      break;
    }
  }
  if (headingIdx === -1) return null;

  let endIdx = lines.length;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^#{1,3}\s+\*\*(?:SUPPLEMENTARY|Supplementary)/i.test(line)) {
      endIdx = i;
      break;
    }
    if (/^#{1,3}\s+\S/.test(line) && !/^\d/.test(trimmed)) {
      endIdx = i;
      break;
    }
    if (/^\*\*(?:Supplementary|SUPPLEMENTARY)/.test(trimmed)) {
      endIdx = i;
      break;
    }
    if (/^:::\{/.test(trimmed) || /^```/.test(trimmed)) {
      endIdx = i;
      break;
    }
  }

  const blockLines = lines.slice(headingIdx, endIdx);
  return { headingLine: headingIdx, endLine: endIdx, text: blockLines.join('\n') };
}

function buildCitationMaps(refs: ParsedReference[]): { maps: CitationMaps; bib: string } {
  const fieldsByNum = new Map<number, Record<string, string>>();
  for (const ref of refs) {
    fieldsByNum.set(ref.number, parseReferenceFields(ref.text));
  }

  const numToKey = dedupeCitekeys(refs, fieldsByNum);
  const citeIdToKey = new Map<string, string>();
  for (const ref of refs) {
    if (ref.citeId) citeIdToKey.set(ref.citeId, numToKey.get(ref.number)!);
  }

  const entries = refs.map((ref) => {
    const fields = fieldsByNum.get(ref.number)!;
    const key = numToKey.get(ref.number)!;
    const bibType = fields.journal ? 'article' : 'misc';
    return renderBibtexEntry(bibType, key, fields);
  });

  return {
    maps: { numToKey, citeIdToKey },
    bib: entries.join('\n'),
  };
}

function expandNumberSpec(spec: string): number[] {
  const out: number[] = [];
  for (const part of spec.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const range = trimmed.match(/^(\d+)\s*--\s*(\d+)$/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      for (let n = lo; n <= hi; n++) out.push(n);
      continue;
    }
    const n = Number(trimmed);
    if (!Number.isNaN(n)) out.push(n);
  }
  return out;
}

function keysForNumbers(nums: number[], maps: CitationMaps): string[] {
  const keys: string[] = [];
  for (const n of nums) {
    const key = maps.numToKey.get(n);
    if (key) keys.push(key);
  }
  return keys;
}

function formatCiteCluster(keys: string[]): string {
  if (!keys.length) return '';
  if (keys.length === 1) return `[@${keys[0]}]`;
  return `[@${keys.join('; @')}]`;
}

function rewritePaperpile(content: string, maps: CitationMaps): string {
  const pattern =
    /\[\s*\^([^\]]+?)\^\s*\]\(\s*https?:\/\/paperpile\.com\/c\/[^)]+\/([^)]+)\s*\)/gi;

  return content.replace(pattern, (_m, bracket: string, urlIds: string) => {
    const ids = urlIds.split('+').filter(Boolean);
    const keysFromIds = ids.map((id) => maps.citeIdToKey.get(id)).filter(Boolean) as string[];
    if (keysFromIds.length) return formatCiteCluster(keysFromIds);

    const nums = expandNumberSpec(bracket.replace(/\^/g, ''));
    const keys = keysForNumbers(nums, maps);
    return keys.length ? formatCiteCluster(keys) : _m;
  });
}

function rewriteSuperscript(content: string, maps: CitationMaps): string {
  let result = content.replace(/\^([\d,\-]+)\^/g, (_m, spec: string) => {
    const keys = keysForNumbers(expandNumberSpec(spec), maps);
    return keys.length ? formatCiteCluster(keys) : _m;
  });

  result = result.replace(/\$\^\{([\d,\-]+)\}\$/g, (_m, spec: string) => {
    const keys = keysForNumbers(expandNumberSpec(spec), maps);
    return keys.length ? formatCiteCluster(keys) : _m;
  });

  return result;
}

function rewriteItalicParen(content: string, maps: CitationMaps): string {
  let result = content.replace(
    /\(\*(\d+)\*\s*--\s*\*(\d+)\*\)/g,
    (_m, a: string, b: string) => {
      const lo = Number(a);
      const hi = Number(b);
      const nums: number[] = [];
      for (let n = Math.min(lo, hi); n <= Math.max(lo, hi); n++) nums.push(n);
      const keys = keysForNumbers(nums, maps);
      return keys.length ? formatCiteCluster(keys) : _m;
    },
  );

  result = result.replace(
    /\(\*(\d+)\*\s+and\s+\*(\d+)\*\)/g,
    (_m, a: string, b: string) => {
      const keys = keysForNumbers([Number(a), Number(b)], maps);
      return keys.length ? formatCiteCluster(keys) : _m;
    },
  );

  result = result.replace(/\(\*(\d+)\*\)/g, (_m, n: string) => {
    const keys = keysForNumbers([Number(n)], maps);
    return keys.length ? formatCiteCluster(keys) : _m;
  });

  return result;
}

function rewritePartText(text: string, maps: CitationMaps, dialect: CitationDialect): string {
  if (dialect === 'paperpile') return rewritePaperpile(text, maps);
  if (dialect === 'superscript') return rewriteSuperscript(text, maps);
  if (dialect === 'italic-paren') return rewriteItalicParen(text, maps);
  return text;
}

function rewriteFrontmatterParts(
  fmLines: string[],
  maps: CitationMaps,
  dialect: CitationDialect,
): string[] {
  const out = [...fmLines];
  let i = 0;
  while (i < out.length) {
    const partMatch = out[i].match(/^(\s{2})([a-z_]+):\s*\|\s*$/);
    if (partMatch) {
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
      const rewritten = rewritePartText(contentLines.join('\n'), maps, dialect);
      const newLines = rewritten.split('\n').map((l) => `${indent}${l}`);
      out.splice(start, end - start, ...newLines);
      i = start + newLines.length;
      continue;
    }
    i++;
  }
  return out;
}

function removeReferencesFromBody(
  bodyLines: string[],
  block: { headingLine: number; endLine: number },
): string[] {
  return [...bodyLines.slice(0, block.headingLine), ...bodyLines.slice(block.endLine)];
}

export interface ImproveDocxCitationsResult {
  dialect: CitationDialect;
  references: number;
  replacements: boolean;
}

export async function improveDocxCitations(options: {
  article?: string;
  bib?: string;
  myst?: string;
  dryRun: boolean;
  cwd: string;
}): Promise<ImproveDocxCitationsResult> {
  const articlePath = path.resolve(options.cwd, options.article ?? 'article.md');
  const bibPath = path.resolve(options.cwd, options.bib ?? 'references.bib');
  const mystPath = resolveProjectConfigPath(options.cwd, options.myst ?? 'myst.yml');

  const md = fs.readFileSync(articlePath, 'utf8');
  const dialect = detectCitationDialect(md);
  if (dialect === 'none') {
    process.stdout.write('Done. No DOCX citation dialect detected.\n');
    return { dialect, references: 0, replacements: false };
  }

  const { hasFrontmatter, fmLines, bodyLines } = splitArticleFrontmatter(md);
  let body = bodyLines.join('\n');

  const refBlock = findReferencesBlock(body);
  if (!refBlock) {
    process.stdout.write(`Done. ${dialect} citations found but no references section.\n`);
    return { dialect, references: 0, replacements: false };
  }

  const refs = splitReferenceEntries(refBlock.text, dialect);
  if (!refs.length) {
    process.stdout.write('Done. References heading found but no entries parsed.\n');
    return { dialect, references: 0, replacements: false };
  }

  const { maps, bib } = buildCitationMaps(refs);
  let bodyLinesOut = removeReferencesFromBody(bodyLines, refBlock);
  body = bodyLinesOut.join('\n');
  body = rewritePartText(body, maps, dialect);

  const newFmLines = rewriteFrontmatterParts(fmLines, maps, dialect);
  const newMd = assembleArticleWithParts(hasFrontmatter, newFmLines, body.split('\n'));

  if (!options.dryRun) {
    fs.writeFileSync(articlePath, newMd, 'utf8');
    fs.writeFileSync(bibPath, bib, 'utf8');
    if (fs.existsSync(mystPath)) {
      const myst = fs.readFileSync(mystPath, 'utf8');
      const updated = ensureMystBibliography(myst, 'references.bib');
      if (updated !== myst) fs.writeFileSync(mystPath, updated, 'utf8');
    }
  }

  logStep([
    'Done.',
    `${dialect}: ${refs.length} references → references.bib`,
    options.dryRun ? '(dry-run)' : null,
  ]);

  return { dialect, references: refs.length, replacements: true };
}
