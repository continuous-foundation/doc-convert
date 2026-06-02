import path from 'node:path';
import type { RunContext, StepDisposition } from '../../engine/types.js';
import { fileExists } from '../../engine/context.js';

export function bibPath(ctx: RunContext): string {
  return path.join(ctx.workdirAbs, 'references.bib');
}

export function whenReferencesBib(ctx: RunContext): StepDisposition {
  if (ctx.options.dryRun && !fileExists(bibPath(ctx))) return 'warn-skip';
  return fileExists(bibPath(ctx)) ? 'run' : 'warn-skip';
}
