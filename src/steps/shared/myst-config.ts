import path from 'node:path';
import { fileExists } from '../../engine/context.js';
import { readUtf8 } from './fs.js';

export function resolveProjectConfigPath(cwd: string, mystArg = 'myst.yml'): string {
  return path.resolve(cwd, mystArg);
}

export function readProjectIdFromConfig(configPath: string): string | null {
  if (!fileExists(configPath)) return null;
  try {
    const m = readUtf8(configPath).match(/^\s*id:\s*([^\s#]+)\s*$/m);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}
