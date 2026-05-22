import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { RunContext } from './types.js';
import { fileExists } from './context.js';

export function scriptPath(ctx: RunContext, scriptRel: string): string {
  return path.join(ctx.scriptsDir, scriptRel);
}

export function hasArticleScripts(ctx: RunContext): boolean {
  return fileExists(ctx.scriptsDir);
}

/**
 * Run a TypeScript script from the article repo's `script/` folder (Node strip-types).
 */
export function spawnArticleScript(
  ctx: RunContext,
  scriptRel: string,
  args: string[],
  cwd: string,
): void {
  const scriptPathAbs = scriptPath(ctx, scriptRel);
  if (!fileExists(scriptPathAbs)) {
    throw new Error(
      `Missing script ${scriptRel} under ${ctx.scriptsDir}. Is --project-root set to the article repo?`,
    );
  }

  console.log(
    `$ (cd ${cwd} && node --experimental-strip-types ${path.relative(ctx.projectRoot, scriptPathAbs) || scriptRel} ${args.join(' ')})`.trim(),
  );

  const res = spawnSync(process.execPath, ['--experimental-strip-types', scriptPathAbs, ...args], {
    stdio: 'inherit',
    env: process.env,
    cwd,
  });

  if (res.error) throw res.error;
  const code = typeof res.status === 'number' ? res.status : 1;
  if (code !== 0) {
    throw new Error(`Script failed (${scriptRel}) with exit code ${code}`);
  }
}

export function commonArgs(ctx: RunContext): string[] {
  return ctx.options.dryRun ? ['--dry-run'] : [];
}

export function copyTree(src: string, dest: string): void {
  fs.cpSync(src, dest, { recursive: true, force: true });
}
