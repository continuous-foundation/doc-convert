import type { Ruleset } from '../engine/types.js';
import { markdownBodySteps } from '../steps/common/index.js';
import {
  cleanPandocArtifactsStep,
  copyDocxDependenciesStep,
  extractDocxFrontmatterStep,
  extractDocxPartsStep,
  improveDocxCrossrefsStep,
  improveDocxCitationsStep,
  improveDocxFiguresStep,
  improveDocxMathStep,
  improveDocxTablesStep,
  pandocDocxToMdStep,
} from '../steps/docx/index.js';

export const docxRuleset: Ruleset = {
  id: 'docx',
  label: 'DOCX → Markdown via Pandoc, then plain Markdown pipeline',
  steps: [
    pandocDocxToMdStep,
    copyDocxDependenciesStep,
    ...markdownBodySteps.slice(0, 1),
    extractDocxFrontmatterStep,
    extractDocxPartsStep,
    cleanPandocArtifactsStep,
    improveDocxFiguresStep,
    improveDocxTablesStep,
    improveDocxCrossrefsStep,
    improveDocxMathStep,
    improveDocxCitationsStep,
    ...markdownBodySteps.slice(1),
  ],
};
