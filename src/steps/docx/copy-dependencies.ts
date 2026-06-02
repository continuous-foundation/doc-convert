import path from 'node:path';
import type { PipelineStep } from '../../engine/types.js';
import { fileExists } from '../../engine/context.js';
import { copyTree } from '../../engine/copy-tree.js';
import { PROJECT_DEPENDENCIES } from '../../engine/project-dependencies.js';

export const copyDocxDependenciesStep: PipelineStep = {
  id: 'copyDocxDependencies',
  label: 'Copy optional project dependencies into workdir',
  run: async (ctx) => {
    const { projectRoot, workdirAbs, options } = ctx;
    if (options.dryRun) {
      console.log('[dry-run] would copy project dependencies into workdir');
      return;
    }

    let copied = 0;
    for (const dep of PROJECT_DEPENDENCIES) {
      const src = path.join(projectRoot, dep);
      const dest = path.join(workdirAbs, dep);
      if (!fileExists(src)) continue;
      copyTree(src, dest);
      console.log(`  - copy    ${dep}`);
      copied++;
    }
    if (copied === 0) {
      console.log('  (no optional dependencies found in project root)');
    }
  },
};
