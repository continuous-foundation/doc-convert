/**
 * Steps shared across markdown, jupytext, and docx entry points.
 *
 * - `prepareWorkdirStep` — bootstrap for .md inputs (not used by docx; see docx/).
 * - `markdownBodySteps` — myst init through github (used after prepare or Pandoc).
 */
import type { PipelineStep } from '../../engine/types.js';
import { enrichAffiliationsRorStep } from './enrich-affiliations-ror.js';
import { extractGithubRemoteStep } from './extract-github-remote.js';
import { improveCitationTagsStep } from './improve-citation-tags.js';
import { initMystConfigStep } from './init-myst-config.js';
import { prepareWorkdirStep } from './prepare-workdir.js';

export { prepareWorkdirStep } from './prepare-workdir.js';
export { initMystConfigStep } from './init-myst-config.js';
export { improveCitationTagsStep } from './improve-citation-tags.js';
export { enrichAffiliationsRorStep } from './enrich-affiliations-ror.js';
export { extractGithubRemoteStep } from './extract-github-remote.js';

/** Plain markdown + docx (after article.md exists in workdir). */
export const markdownBodySteps: PipelineStep[] = [
  initMystConfigStep,
  improveCitationTagsStep,
  enrichAffiliationsRorStep,
  extractGithubRemoteStep,
];
