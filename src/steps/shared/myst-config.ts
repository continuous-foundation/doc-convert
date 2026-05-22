import path from 'node:path';
import { fileExists } from '../../engine/context.js';

/**
 * Resolve project config path: prefer myst.yml, fall back to legacy curvenote.yml.
 */
export function resolveProjectConfigPath(cwd: string, mystArg = 'myst.yml'): string {
  const abs = path.resolve(cwd, mystArg);
  if (fileExists(abs)) return abs;
  if (mystArg === 'myst.yml') {
    const legacy = path.resolve(cwd, 'curvenote.yml');
    if (fileExists(legacy)) return legacy;
  }
  return abs;
}
