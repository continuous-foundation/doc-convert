import fs from 'node:fs';

export function readUtf8(path: string): string {
  return fs.readFileSync(path, 'utf8');
}

export function writeUtf8(path: string, content: string, dryRun: boolean): void {
  if (dryRun) return;
  fs.writeFileSync(path, content, 'utf8');
}
