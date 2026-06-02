export interface SkipRange {
  start: number;
  end: number;
}

export function buildMarkdownSkipRanges(content: string): SkipRange[] {
  const ranges: SkipRange[] = [];

  if (content.startsWith('---')) {
    const end = content.indexOf('\n---', 3);
    if (end !== -1) ranges.push({ start: 0, end: end + 4 });
  }

  const patterns = [
    /^```[\s\S]*?^```/gm,
    /^:::\s*\{[\s\S]*?^:::/gm,
    /^:::\s*\n[\s\S]*?^:::/gm,
  ];

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(content)) !== null) {
      ranges.push({ start: m.index, end: m.index + m[0].length });
    }
  }

  ranges.sort((a, b) => a.start - b.start);
  return ranges;
}

export function buildFigureAwareSkipRanges(content: string): SkipRange[] {
  const ranges: SkipRange[] = [];

  const patterns = [
    /^```(?!{figure})[\s\S]*?^```/gm,
    /^:::\{[\s\S]*?^:::/gm,
    /^:::\s*\n[\s\S]*?^:::/gm,
  ];

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(content)) !== null) {
      ranges.push({ start: m.index, end: m.index + m[0].length });
    }
  }

  ranges.sort((a, b) => a.start - b.start);
  return ranges;
}

export function inSkipRange(ranges: SkipRange[], idx: number): boolean {
  return ranges.some((s) => idx >= s.start && idx < s.end);
}

export function replaceOutsideSkipRanges(
  content: string,
  ranges: SkipRange[],
  replacer: (match: string, ...args: string[]) => string,
  pattern: RegExp,
): string {
  if (!pattern.global) {
    throw new Error('replaceOutsideSkipRanges requires a global RegExp');
  }

  return content.replace(pattern, (match, ...args) => {
    const offset = args[args.length - 2] as number;
    if (inSkipRange(ranges, offset)) return match;
    const groups = args.slice(0, -2) as string[];
    return replacer(match, ...groups);
  });
}
