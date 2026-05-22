import type { PipelineStep } from '../../engine/types.js';
import { prepareWorkdir } from '../../engine/workdir.js';

/** Wipe the workdir, copy the source markdown, and mirror optional project assets. */
export const prepareWorkdirStep: PipelineStep = {
  id: 'prepareWorkdir',
  label: 'Prepare workdir (wipe + copy input and dependencies)',
  inputs: ['markdown', 'project'],
  run: prepareWorkdir,
};
