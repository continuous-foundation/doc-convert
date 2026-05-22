import path from 'node:path';
import type { RunContext, StepDisposition } from '../../engine/types.js';
import { fileExists } from '../../engine/context.js';
import { findGitRoot } from './git.js';
export function bibPath(ctx: RunContext): string {
  return path.join(ctx.workdirAbs, 'references.bib');
}

export function whenNotebook(ctx: RunContext): StepDisposition {
  const inProject = path.join(ctx.projectRoot, 'article.ipynb');
  return fileExists(inProject) || fileExists(ctx.articleIpynb) ? 'run' : 'warn-skip';
}

export function whenReferencesBib(ctx: RunContext): StepDisposition {
  if (ctx.options.dryRun && !fileExists(bibPath(ctx))) return 'warn-skip';
  return fileExists(bibPath(ctx)) ? 'run' : 'warn-skip';
}

export function whenGithubRemote(ctx: RunContext): StepDisposition {
  if (ctx.options.dryRun) return 'skip';
  if (!findGitRoot(ctx.workdirAbs) && !findGitRoot(ctx.projectRoot)) {
    return 'warn-skip';
  }
  return 'run';
}
