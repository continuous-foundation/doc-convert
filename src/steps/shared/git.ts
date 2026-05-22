import path from 'node:path';
import { fileExists } from '../../engine/context.js';

/** Walk up from `start` until a `.git` entry is found, or return null. */
export function findGitRoot(start: string): string | null {
  let dir = path.resolve(start);
  for (let i = 0; i < 64; i++) {
    if (fileExists(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}
