import path from 'node:path';
import type { PipelineStep } from '../../engine/types.js';
import { logStep } from '../../engine/step-log.js';
import { stepOpts } from '../../engine/step-context.js';
import { readUtf8, writeUtf8 } from '../shared/fs.js';
import { stripMarkdownInline } from '../shared/markdown-inline.js';
import {
  closeMystProject,
  openMystProject,
  prependProjectLines,
  removeProjectKey,
} from '../shared/myst-yaml-project.js';
import { resolveProjectConfigPath } from '../shared/myst-config.js';
import { splitArticleFrontmatter, assembleArticleWithParts } from '../shared/myst-parts.js';
import { yamlQuote } from '../shared/yaml-scalar.js';

const DEFAULT_ARTICLE = 'article.md';
const DEFAULT_MYST = 'myst.yml';

interface DocxAuthor {
  name: string;
  affiliationIds: string[];
  corresponding?: boolean;
  equalContribution?: boolean;
  email?: string;
}

interface ExtractedDocxFrontmatter {
  title: string | null;
  authors: DocxAuthor[];
  affiliations: Map<string, string>;
  keywords: string[];
  correspondence: string | null;
  headerEndLine: number;
}

interface RunExtractDocxFrontmatterOptions {
  article?: string;
  myst?: string;
  dryRun: boolean;
  cwd: string;
}

function isSectionStart(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^#{1,6}\s/.test(t)) return true;
  if (/^\*\*Abstract\*\*:?\s*$/i.test(t)) return true;
  if (/^\*\*Abstract:\*\*/i.test(t)) return true;
  if (/^\*\*Main Text:\*\*/i.test(t)) return true;
  if (/^###\s+\*\*ABSTRACT\*\*/i.test(t)) return true;
  if (/^\*\*Highlights\*\*/i.test(t)) return true;
  if (/^\*\*Introduction\*\*$/i.test(t)) return true;
  if (/^\*\*INTRODUCTION\*\*$/i.test(t)) return true;
  return false;
}

function isLabeledHeader(line: string): boolean {
  return /^\*\*(Title|Authors|Affiliations|Abstract|Keywords)\*\*:?\s*/i.test(line.trim());
}

function parseLabeledFormat(lines: string[]): ExtractedDocxFrontmatter | null {
  const first = lines[0]?.trim() ?? '';
  if (!/^\*\*Title:\*\*/i.test(first) && !/^\*\*Title:\*\*\s*\*\*/i.test(first)) {
    return null;
  }

  let title: string | null = null;
  let authorsRaw = '';
  let affiliationsRaw = '';
  let keywords: string[] = [];
  let headerEndLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();

    if (/^\*\*Title:\*\*/i.test(t)) {
      title = stripMarkdownInline(t.replace(/^\*\*Title:\*\*/i, '').trim());
      headerEndLine = i + 1;
      continue;
    }
    if (/^\*\*Authors:\*\*/i.test(t)) {
      authorsRaw = t.replace(/^\*\*Authors:\*\*/i, '').trim();
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j].trim();
        if (/^\*\*Affiliations:\*\*/i.test(next) || isSectionStart(next)) break;
        authorsRaw += ' ' + next;
        j++;
      }
      headerEndLine = j;
      i = j - 1;
      continue;
    }
    if (/^\*\*Affiliations:\*\*/i.test(t)) {
      affiliationsRaw = t.replace(/^\*\*Affiliations:\*\*/i, '').trim();
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j].trim();
        if (isLabeledHeader(lines[j]) || isSectionStart(next)) break;
        affiliationsRaw += ' ' + next;
        j++;
      }
      headerEndLine = j;
      i = j - 1;
      continue;
    }
    if (/^\*\*Keywords:\*\*/i.test(t)) {
      const kw = t.replace(/^\*\*Keywords:\*\*/i, '').trim();
      keywords = kw
        .split(',')
        .map((k) => stripMarkdownInline(k))
        .filter(Boolean);
      headerEndLine = i + 1;
      continue;
    }
    if (isSectionStart(t)) {
      headerEndLine = i;
      break;
    }
  }

  const { authors, affiliations, correspondence } = parseAuthorsAndAffiliations(
    authorsRaw,
    affiliationsRaw,
  );

  return {
    title,
    authors,
    affiliations,
    keywords,
    correspondence,
    headerEndLine,
  };
}

function parseHeuristicFormat(lines: string[]): ExtractedDocxFrontmatter {
  let headerEndLine = 0;
  let titleParts: string[] = [];
  let authorsRaw = '';
  const affiliationLines: string[] = [];
  let keywords: string[] = [];
  let correspondence: string | null = null;

  let phase: 'title' | 'authors' | 'affiliations' | 'meta' | 'done' = 'title';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();

    if (!t) {
      if (phase === 'title' && titleParts.length) phase = 'authors';
      continue;
    }

    if (isSectionStart(t)) {
      headerEndLine = i;
      phase = 'done';
      break;
    }

    if (/^\*\*Keywords:\*\*/i.test(t)) {
      const kw = t.replace(/^\*\*Keywords:\*\*/i, '').replace(/\*\*$/, '').trim();
      keywords = kw
        .split(',')
        .map((k) => stripMarkdownInline(k))
        .filter(Boolean);
      headerEndLine = i + 1;
      continue;
    }

    if (/^Correspondence:/i.test(t) || /^\*+\s*Correspondence/i.test(t)) {
      correspondence = stripMarkdownInline(t.replace(/^Correspondence:\s*/i, ''));
      headerEndLine = i + 1;
      continue;
    }

    if (/^\*+\s*Contributed equally/i.test(t) || /^\\?\*\s*Contributed/i.test(t)) {
      headerEndLine = i + 1;
      continue;
    }

    if (phase === 'title') {
      if (/^\*\*/.test(t) && !/^#{1,6}\s/.test(t) && !/\^[\d,\*#]+\^/.test(t)) {
        titleParts.push(stripMarkdownInline(t));
        headerEndLine = i + 1;
        continue;
      }
      phase = 'authors';
    }

    if (phase === 'authors') {
      if (/^\d+\.\s+/.test(t) || /^\^[\d]+\^/.test(t)) {
        phase = 'affiliations';
      } else if (/\^[\d,\*#]+\^/.test(t) || (t.includes(',') && /\^/.test(t))) {
        authorsRaw += (authorsRaw ? ' ' : '') + t;
        headerEndLine = i + 1;
        continue;
      } else if (titleParts.length && !authorsRaw) {
        titleParts.push(stripMarkdownInline(t));
        headerEndLine = i + 1;
        continue;
      }
    }

    if (phase === 'affiliations') {
      if (/^\d+\.\s+/.test(t) || /^\^[\d]+\^/.test(t)) {
        affiliationLines.push(t);
        headerEndLine = i + 1;
        continue;
      }
      // Continuation of a numbered affiliation (indented wrap line).
      if (
        affiliationLines.length &&
        /^\s{2,}\S/.test(line) &&
        !/^Correspondence:/i.test(t)
      ) {
        affiliationLines[affiliationLines.length - 1] += ' ' + t;
        headerEndLine = i + 1;
        continue;
      }
      if (/^Correspondence:/i.test(t) || /^\*+\s*Contributed/i.test(t)) {
        i--;
        phase = 'meta';
        continue;
      }
      if (isSectionStart(t)) {
        headerEndLine = i;
        break;
      }
    }
  }

  const title = titleParts.length ? titleParts.join(' ').replace(/\s+/g, ' ').trim() : null;
  const affiliationsRaw = affiliationLines.join(' ');
  const { authors, affiliations, correspondence: corr2 } = parseAuthorsAndAffiliations(
    authorsRaw,
    affiliationsRaw,
  );

  return {
    title,
    authors,
    affiliations,
    keywords,
    correspondence: correspondence ?? corr2,
    headerEndLine,
  };
}

function parseCorrespondenceEmails(text: string): Map<string, string> {
  const map = new Map<string, string>();
  const emailSection = text.match(/Email:\s*([\s\S]+)$/i);
  if (!emailSection) return map;

  for (const m of emailSection[1].matchAll(/<?([\w.+-]+@[\w.-]+)>?\s*\(([^)]+)\)/g)) {
    map.set(m[2].trim(), m[1].replace(/^<|>$/g, '').trim());
  }
  return map;
}

function authorInitials(name: string): string[] {
  const cleaned = name.replace(/,.*/, '').trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return [];
  const first = tokens[0]![0]!.toUpperCase();
  const last = tokens[tokens.length - 1]![0]!.toUpperCase();
  const dotted = tokens.map((t) => `${t[0]!.toUpperCase()}.`).join('');
  const dottedSpaced = tokens.map((t) => `${t[0]!.toUpperCase()}.`).join(' ');
  return [`${first}.${last}.`, `${first}${last}`, dotted, dottedSpaced.trim()];
}

function stripCorrespondenceBlock(affiliationsRaw: string): string {
  return affiliationsRaw.replace(/\*?\s*Corresponding author[\s\S]*$/i, '').trim();
}

function parseAuthorsAndAffiliations(
  authorsRaw: string,
  affiliationsRaw: string,
): {
  authors: DocxAuthor[];
  affiliations: Map<string, string>;
  correspondence: string | null;
} {
  const affiliations = new Map<string, string>();
  const cleanedAffiliationsRaw = stripCorrespondenceBlock(affiliationsRaw);
  const correspondenceEmails = parseCorrespondenceEmails(affiliationsRaw);

  // ^1^ Org name ... ^2^ Org ...
  const supAffRe = /\^(\d+)\^\s*([^]*?)(?=\^\d+\^|$)/g;
  let m: RegExpExecArray | null;
  while ((m = supAffRe.exec(cleanedAffiliationsRaw)) !== null) {
    affiliations.set(m[1], stripMarkdownInline(m[2].trim()));
  }

  // 1. Org name 2. Org ...
  const numAffRe = /(?:^|\s)(\d+)\.\s+([^]*?)(?=(?:\s\d+\.\s+)|$)/g;
  while ((m = numAffRe.exec(cleanedAffiliationsRaw)) !== null) {
    affiliations.set(m[1], stripMarkdownInline(m[2].trim()));
  }

  let correspondence: string | null = null;
  const corrMatch = affiliationsRaw.match(/\*Corresponding author[^*]*\*?\s*(.+)$/i);
  if (corrMatch) {
    correspondence = stripMarkdownInline(corrMatch[1]);
  }

  const authors: DocxAuthor[] = [];
  const cleanedAuthors = authorsRaw.replace(/\s+/g, ' ').trim();
  if (!cleanedAuthors) {
    return { authors, affiliations, correspondence };
  }

  // Author entries end with ^affiliation-ids^ (pandoc/docx superscript markers).
  const authorEntryRe = /(?:^|,\s*)([^,]+?\^[^^]+\^)/g;
  const entries: string[] = [];
  while ((m = authorEntryRe.exec(cleanedAuthors)) !== null) {
    entries.push(m[1].trim());
  }

  if (!entries.length) {
    entries.push(...cleanedAuthors.split(/,\s*(?=[A-Z])/));
  }

  for (const part of entries) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const affMatch = trimmed.match(/\^([^^]+)\^/);
    const affiliationIds = affMatch
      ? affMatch[1]
          .split(',')
          .map((x) => x.replace(/[^\d]/g, ''))
          .filter(Boolean)
      : [];

    let name = trimmed.replace(/\^[^^]+\^/g, '').trim();
    name = stripMarkdownInline(name);

    if (!name || /^Affiliations:/i.test(name)) continue;

    let email: string | undefined;
    if (/#/.test(affMatch?.[1] ?? '') || /\*/.test(affMatch?.[1] ?? '')) {
      for (const initials of authorInitials(name)) {
        const hit = correspondenceEmails.get(initials);
        if (hit) {
          email = hit;
          break;
        }
      }
    }

    authors.push({
      name,
      affiliationIds,
      corresponding: /#/.test(affMatch?.[1] ?? '') || /\*/.test(affMatch?.[1] ?? ''),
      equalContribution: /\*/.test(affMatch?.[1] ?? ''),
      email,
    });
  }

  return { authors, affiliations, correspondence };
}

function parseDocxHeader(md: string): ExtractedDocxFrontmatter | null {
  const { bodyLines } = splitArticleFrontmatter(md);
  const lines = bodyLines;

  const labeled = parseLabeledFormat(lines);
  if (labeled) return labeled;

  const heuristic = parseHeuristicFormat(lines);
  if (heuristic.title || heuristic.authors.length) return heuristic;

  return null;
}

function updateMystProjectFrontmatter(
  mystYaml: string,
  extracted: ExtractedDocxFrontmatter,
): string {
  const block = openMystProject(mystYaml);

  if (extracted.title) {
    removeProjectKey(block.projectLines, 'title');
    prependProjectLines(block.projectLines, [`  title: ${yamlQuote(extracted.title)}`]);
  }

  if (extracted.keywords.length) {
    removeProjectKey(block.projectLines, 'keywords');
    prependProjectLines(block.projectLines, [
      '  keywords:',
      ...extracted.keywords.map((k) => `    - ${yamlQuote(k)}`),
    ]);
  }

  if (extracted.authors.length) {
    removeProjectKey(block.projectLines, 'authors');
    const authorLines = ['  authors:'];
    for (const author of extracted.authors) {
      authorLines.push(`    - name: ${yamlQuote(author.name)}`);
      if (author.corresponding) authorLines.push('      corresponding: true');
      if (author.email) authorLines.push(`      email: ${yamlQuote(author.email)}`);
      if (author.equalContribution) authorLines.push('      equal_contributor: true');
      const affTexts = author.affiliationIds
        .map((id) => extracted.affiliations.get(id))
        .filter((x): x is string => Boolean(x));
      if (affTexts.length) {
        authorLines.push('      affiliations:');
        for (const aff of affTexts) {
          authorLines.push(`        - ${yamlQuote(aff)}`);
        }
      }
    }
    prependProjectLines(block.projectLines, authorLines);
  }

  return closeMystProject(block);
}

function rewriteArticleMarkdown(md: string, extracted: ExtractedDocxFrontmatter): string {
  const { hasFrontmatter, fmLines, bodyLines } = splitArticleFrontmatter(md);

  const newBody = bodyLines.slice(extracted.headerEndLine);
  while (newBody.length && newBody[0].trim() === '') newBody.shift();

  const newFm = [...fmLines];
  if (extracted.title) {
    const titleIdx = newFm.findIndex((l) => /^title:\s*/.test(l));
    const titleLine = `title: ${yamlQuote(extracted.title)}`;
    if (titleIdx >= 0) newFm[titleIdx] = titleLine;
    else newFm.unshift(titleLine);
  }

  if (extracted.keywords.length) {
    const kwIdx = newFm.findIndex((l) => /^keywords:\s*$/.test(l));
    const kwBlock = ['keywords:', ...extracted.keywords.map((k) => `  - ${yamlQuote(k)}`)];
    if (kwIdx >= 0) {
      let end = kwIdx + 1;
      while (end < newFm.length && /^\s+-\s+/.test(newFm[end])) end++;
      newFm.splice(kwIdx, end - kwIdx, ...kwBlock);
    } else {
      newFm.push(...kwBlock);
    }
  }

  let result = assembleArticleWithParts(hasFrontmatter, newFm, newBody);

  if (extracted.title) {
    const lines = result.split('\n');
    let yamlEnd = -1;
    if (lines[0] === '---') {
      for (let i = 1; i < lines.length; i++) {
        if (lines[i] === '---') {
          yamlEnd = i;
          break;
        }
      }
    }
    if (yamlEnd >= 0) {
      const after = lines.slice(yamlEnd + 1);
      while (after.length && after[0].trim() === '') after.shift();
      if (!after.length || !after[0].startsWith('# ')) {
        after.unshift(`# ${extracted.title}`);
      } else {
        after[0] = `# ${extracted.title}`;
      }
      result = [...lines.slice(0, yamlEnd + 1), '', ...after].join('\n');
    }
  }

  return result;
}

async function extractDocxFrontmatter(options: RunExtractDocxFrontmatterOptions): Promise<void> {
  const cwd = options.cwd;
  const articlePath = path.resolve(cwd, options.article ?? DEFAULT_ARTICLE);
  const mystPath = resolveProjectConfigPath(cwd, options.myst ?? DEFAULT_MYST);

  const articleMd = readUtf8(articlePath);
  const extracted = parseDocxHeader(articleMd);

  if (!extracted) {
    process.stdout.write('No DOCX frontmatter block detected; skipping.\n');
    return;
  }

  const newArticleMd = rewriteArticleMarkdown(articleMd, extracted);
  const mystYaml = readUtf8(mystPath);
  const newMystYaml = updateMystProjectFrontmatter(mystYaml, extracted);

  const articleChanged = newArticleMd !== articleMd;
  const mystChanged = newMystYaml !== mystYaml;

  if (articleChanged) writeUtf8(articlePath, newArticleMd, options.dryRun);
  if (mystChanged) writeUtf8(mystPath, newMystYaml, options.dryRun);

  logStep([
    'Done.',
    `title: ${extracted.title ?? '(none)'}; authors: ${extracted.authors.length}; affiliations: ${extracted.affiliations.size}`,
    articleChanged || mystChanged ? 'updated article.md and/or myst.yml' : 'no changes',
    options.dryRun ? '(dry-run)' : null,
  ]);
}

export const extractDocxFrontmatterStep: PipelineStep = {
  id: 'extractDocxFrontmatter',
  label: 'Extract DOCX title/authors/affiliations → myst.yml + page frontmatter',
  run: async (ctx) => {
    const o = stepOpts(ctx);
    await extractDocxFrontmatter({
      article: 'article.md',
      myst: 'myst.yml',
      dryRun: o.dryRun,
      cwd: o.cwd,
    });
  },
};
