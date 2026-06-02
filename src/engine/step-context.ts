import path from 'node:path';
import type { RunContext } from './types.js';

export function stepOpts(ctx: RunContext) {
  return {
    cwd: ctx.workdirAbs,
    dryRun: ctx.options.dryRun,
    projectRoot: ctx.projectRoot,
    metadataPath: path.join(ctx.projectRoot, 'metadata.yml'),
  };
}
