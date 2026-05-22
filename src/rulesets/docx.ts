import type { Ruleset } from '../engine/types.js';
import { markdownBodySteps } from '../steps/common/index.js';
import {
  copyDocxDependenciesStep,
  pandocDocxToMdStep,
} from '../steps/docx/index.js';

export const docxRuleset: Ruleset = {
  id: 'docx',
  label: 'DOCX → Markdown via Pandoc, then plain Markdown pipeline',
  steps: [
    pandocDocxToMdStep,
    copyDocxDependenciesStep,
    ...markdownBodySteps,
  ],
};
