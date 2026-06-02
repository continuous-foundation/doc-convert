import fs from 'node:fs';
import path from 'node:path';
import type { PipelineStep } from '../../engine/types.js';
import { logStep } from '../../engine/step-log.js';
import { stepOpts } from '../../engine/step-context.js';
import { readUtf8, writeUtf8 } from '../shared/fs.js';
import { stripMarkdownInline } from '../shared/markdown-inline.js';
import { closeMystProject, openMystProject, setProjectKeywords } from '../shared/myst-yaml-project.js';
import { resolveProjectConfigPath } from '../shared/myst-config.js';
import {
  applyPartsToFrontmatter,
  assembleArticleWithParts,
  partitionPartsByKind,
  removeBodyLineIntervals,
  splitArticleFrontmatter,
} from '../shared/myst-parts.js';
import { yamlQuote } from '../shared/yaml-scalar.js';

const DEFAULT_ARTICLE = 'article.md';
const DEFAULT_MYST = 'myst.yml';

interface PartSpec {
  key: string;
  heading: RegExp;
}

const DOCX_PART_SPECS: PartSpec[] = [
  { key: 'abstract', heading: /^(?:#{1,6}\s+)?(?:\*\*)?ABSTRACT(?:\*\*)?\s*$/i },
  { key: 'abstract', heading: /^\*\*Abstract:\*\*\s*/i },
  { key: 'abstract', heading: /^\*\*Abstract\*\*\s*$/i },
  { key: 'highlights', heading: /^\*\*Highlights\*\*\s*$/i },
  {
    key: 'acknowledgments',
    heading: /^(?:#{1,6}\s+)?(?:\[)?(?:\*\*)?Acknowledgments?(?:\*\*)?(?:\]\{\.underline\})?\s*:?\s*$/i,
  },
  { key: 'acknowledgments', heading: /^\*\*Acknowledgments?:\*\*\s*/i },
];

interface PartRegion {
  key: string;
  start: number;
  end: number;
  content: string;
}

interface RunExtractDocxPartsOptions {
  article?: string;
  dryRun: boolean;
  cwd: string;
}

function stripInlineHeadingLabel(line: string, labelRe: RegExp): string {
  return line.replace(labelRe, '').trim();
}

function matchPartSpec(line: string): { spec: PartSpec; inlineContent: string | null } | null {
  const t = line.trim();
  for (const spec of DOCX_PART_SPECS) {
    if (!spec.heading.test(t)) continue;

    if (/^\*\*Abstract:\*\*\s/i.test(t)) {
      return {
        spec,
        inlineContent: stripInlineHeadingLabel(t, /^\*\*Abstract:\*\*\s*/i),
      };
    }
    if (/^\*\*Acknowledg(?:e?ments?|e?ments?):\*\*\s*/i.test(t)) {
      return {
        spec,
        inlineContent: stripInlineHeadingLabel(
          t,
          /^\*\*Acknowledg(?:e?ments?|e?ments?):\*\*\s*/i,
        ),
      };
    }

    return { spec, inlineContent: null };
  }
  return null;
}

function isStopHeading(line: string): boolean {
  const t = line.trim();
  if (!t) return false;

  if (matchPartSpec(t)) return true;

  if (/^#{1,6}\s+\*\*[A-Z]/.test(t)) return true;
  if (/^#{1,6}\s+\[/.test(t)) return true;
  if (/^\*\*Main Text:\*\*/i.test(t)) return true;
  if (/^\*\*Introduction\*\*\s*$/i.test(t)) return true;
  if (/^\*\*INTRODUCTION\*\*\s*$/i.test(t)) return true;
  if (/^\*\*Keywords:\*\*/i.test(t)) return true;
  if (/^\*\*Author contributions?\*\*/i.test(t)) return true;
  if (/^\[.+\]\{\.underline\}\s*$/.test(t)) return true;
  if (/^###\s+\[/.test(t)) return true;

  // Bold section headings like **Results** (not part headings).
  if (
    /^\*\*[A-Z][^*]{2,}\*\*\s*$/.test(t) &&
    !/abstract|highlights|acknowledg/i.test(t)
  ) {
    return true;
  }

  return false;
}

function findPartRegions(bodyLines: string[]): PartRegion[] {
  const regions: PartRegion[] = [];

  for (let i = 0; i < bodyLines.length; i++) {
    const match = matchPartSpec(bodyLines[i]);
    if (!match) continue;

    const contentLines: string[] = [];
    if (match.inlineContent) contentLines.push(match.inlineContent);

    let end = i;
    for (let j = i + 1; j < bodyLines.length; j++) {
      const next = bodyLines[j];
      if (isStopHeading(next)) break;
      contentLines.push(next);
      end = j;
    }

    const content = contentLines.join('\n').trim();
    if (content) {
      regions.push({ key: match.spec.key, start: i, end, content });
    }

    i = end;
  }

  return regions;
}

function mergePartContent(regions: PartRegion[]): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const r of regions) {
    if (parts[r.key]) {
      parts[r.key] = `${parts[r.key]}\n\n${r.content}`.trim();
    } else {
      parts[r.key] = r.content;
    }
  }
  return parts;
}

function extractKeywordsFromBody(bodyLines: string[]): {
  keywords: string[];
  removeStart: number;
  removeEnd: number;
} | null {
  for (let i = 0; i < bodyLines.length; i++) {
    const t = bodyLines[i].trim();
    if (/^#\s/.test(t)) continue;
    if (!t) continue;
    if (/^\*\*Keywords:\*\*/i.test(t)) {
      const kwParts = [t.replace(/^\*\*Keywords:\*\*/i, '').trim()];
      let end = i;
      for (let j = i + 1; j < bodyLines.length; j++) {
        const next = bodyLines[j].trim();
        if (!next) break;
        if (/^\*\*[A-Z][^*]*\*\*\s*$/.test(next) || /^#{1,6}\s/.test(next)) break;
        kwParts.push(next);
        end = j;
      }
      const keywords = kwParts
        .join(' ')
        .split(',')
        .map((k) => stripMarkdownInline(k))
        .filter(Boolean);
      return { keywords, removeStart: i, removeEnd: end };
    }
    if (/^\*\*(Introduction|INTRODUCTION)\*\*/.test(t) || /^#{1,6}\s/.test(t)) break;
  }
  return null;
}

function applyKeywordsToFrontmatter(fmLines: string[], keywords: string[]): void {
  if (!keywords.length) return;
  const kwIdx = fmLines.findIndex((l) => /^keywords:\s*$/.test(l));
  const kwBlock = ['keywords:', ...keywords.map((k) => `  - ${yamlQuote(k)}`)];
  if (kwIdx >= 0) {
    let end = kwIdx + 1;
    while (end < fmLines.length && /^\s+-\s+/.test(fmLines[end])) end++;
    fmLines.splice(kwIdx, end - kwIdx, ...kwBlock);
  } else {
    fmLines.push(...kwBlock);
  }
}

function updateMystKeywords(mystYaml: string, keywords: string[]): string {
  if (!keywords.length) return mystYaml;
  const block = openMystProject(mystYaml);
  setProjectKeywords(block.projectLines, keywords);
  return closeMystProject(block);
}

async function extractDocxParts(options: RunExtractDocxPartsOptions): Promise<void> {
  const articlePath = path.resolve(options.cwd, options.article ?? DEFAULT_ARTICLE);
  const md = readUtf8(articlePath);
  const { hasFrontmatter, fmLines, bodyLines } = splitArticleFrontmatter(md);

  const regions = findPartRegions(bodyLines);
  const rawParts = regions.length ? mergePartContent(regions) : {};
  const intervalsToRemove = regions.map((r) => ({ start: r.start, end: r.end }));

  let workingBody = removeBodyLineIntervals(bodyLines, intervalsToRemove);

  const keywordHit = extractKeywordsFromBody(workingBody);
  if (keywordHit) {
    workingBody = [
      ...workingBody.slice(0, keywordHit.removeStart),
      ...workingBody.slice(keywordHit.removeEnd + 1),
    ];
  }

  if (!regions.length && !keywordHit) {
    process.stdout.write('Done. No DOCX document part sections found; no changes.\n');
    return;
  }

  const { knownParts, customParts } = partitionPartsByKind(rawParts);

  // Drop empty ### artifacts and **Main Text:** label left after part extraction.
  const cleanedBody = workingBody.filter((line) => {
    const t = line.trim();
    if (t === '###') return false;
    if (/^\*\*Main Text:\*\*\s*$/i.test(t)) return false;
    return true;
  });

  const newFmLines: string[] = hasFrontmatter ? [...fmLines] : [];
  applyPartsToFrontmatter(newFmLines, knownParts, customParts);
  if (keywordHit) applyKeywordsToFrontmatter(newFmLines, keywordHit.keywords);

  const newMd = assembleArticleWithParts(hasFrontmatter, newFmLines, cleanedBody);
  const mystPath = resolveProjectConfigPath(options.cwd, DEFAULT_MYST);
  let mystChanged = false;
  let newMystYaml = '';
  if (keywordHit && fs.existsSync(mystPath)) {
    const mystYaml = readUtf8(mystPath);
    newMystYaml = updateMystKeywords(mystYaml, keywordHit.keywords);
    mystChanged = newMystYaml !== mystYaml;
  }

  const changed = newMd !== md;
  if (changed) writeUtf8(articlePath, newMd, options.dryRun);
  if (mystChanged) writeUtf8(mystPath, newMystYaml, options.dryRun);

  logStep([
    'Done.',
    `parts: ${Object.keys(rawParts).join(', ') || '(none)'}`,
    keywordHit ? `keywords: ${keywordHit.keywords.length}` : null,
    changed || mystChanged ? 'updated' : 'no changes',
    options.dryRun ? '(dry-run)' : null,
  ]);
}

export const extractDocxPartsStep: PipelineStep = {
  id: 'extractDocxParts',
  label: 'Extract DOCX document parts → page frontmatter',
  run: async (ctx) => {
    const o = stepOpts(ctx);
    await extractDocxParts({
      article: 'article.md',
      dryRun: o.dryRun,
      cwd: o.cwd,
    });
  },
};
