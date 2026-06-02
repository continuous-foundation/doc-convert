import { yamlQuote } from './yaml-scalar.js';

export interface MystProjectBlock {
  lines: string[];
  projectIdx: number;
  projectEnd: number;
  projectLines: string[];
}

export function openMystProject(mystYaml: string): MystProjectBlock {
  const lines = mystYaml.split('\n');
  const projectIdx = lines.findIndex((l) => /^\s*project:\s*$/.test(l));
  if (projectIdx === -1) throw new Error('Project config has no `project:` block');

  let projectEnd = lines.length;
  for (let i = projectIdx + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) {
      projectEnd = i;
      break;
    }
  }

  return {
    lines,
    projectIdx,
    projectEnd,
    projectLines: lines.slice(projectIdx + 1, projectEnd),
  };
}

export function closeMystProject(block: MystProjectBlock): string {
  const { lines, projectIdx, projectEnd, projectLines } = block;
  return [...lines.slice(0, projectIdx + 1), ...projectLines, ...lines.slice(projectEnd)].join(
    '\n',
  );
}

export function removeProjectKey(projectLines: string[], key: string): void {
  const keyRe = new RegExp(`^\\s{2}${key}:\\s*(.*)$`);
  for (let i = 0; i < projectLines.length; i++) {
    if (!keyRe.test(projectLines[i])) continue;
    const isBlock = /^\s{2}\w+:\s*$/.test(projectLines[i]);
    if (!isBlock) {
      projectLines.splice(i, 1);
      return;
    }
    let j = i + 1;
    while (j < projectLines.length && /^\s{4,}\S/.test(projectLines[j])) j++;
    projectLines.splice(i, j - i);
    return;
  }
}

export function prependProjectLines(projectLines: string[], blockLines: string[]): void {
  projectLines.unshift(...blockLines);
}

export function setProjectKeywords(projectLines: string[], keywords: string[]): void {
  if (!keywords.length) return;
  removeProjectKey(projectLines, 'keywords');
  prependProjectLines(projectLines, [
    '  keywords:',
    ...keywords.map((k) => `    - ${yamlQuote(k)}`),
  ]);
}

export function findProjectChildBlock(
  lines: string[],
  projectIdx: number,
  projectEnd: number,
  key: string,
): { start: number; end: number } | null {
  const keyRe = new RegExp(`^\\s{2}${key}:\\s*$`);
  let start = -1;
  for (let i = projectIdx + 1; i < projectEnd; i++) {
    if (keyRe.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  let end = projectEnd;
  for (let i = start + 1; i < projectEnd; i++) {
    if (/^\s{2}[A-Za-z0-9_-]+:\s*/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start, end };
}
