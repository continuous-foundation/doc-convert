import type { Ruleset } from '../engine/types.js';
import {
  enrichAffiliationsRorStep,
  extractGithubRemoteStep,
  improveCitationTagsStep,
  initMystConfigStep,
  prepareWorkdirStep,
} from '../steps/common/index.js';

export const markdownRuleset: Ruleset = {
  id: 'markdown',
  label: 'Plain Markdown (subset pipeline)',
  steps: [
    prepareWorkdirStep,
    initMystConfigStep,
    improveCitationTagsStep,
    enrichAffiliationsRorStep,
    extractGithubRemoteStep,
  ],
};
