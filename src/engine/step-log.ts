type LogLine = string | null | undefined | false;

export function logStep(lines: LogLine[]): void {
  const body = lines.filter((line): line is string => Boolean(line));
  if (!body.length) return;
  process.stdout.write(`${body.join('\n')}\n`);
}
