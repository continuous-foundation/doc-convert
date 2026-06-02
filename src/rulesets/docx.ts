import type { Ruleset } from '../engine/types.js';
import {
  enrichAffiliationsRorStep,
  improveCitationTagsStep,
  initMystConfigStep,
} from '../steps/common/index.js';
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
  label: 'DOCX → MyST',
  steps: [
    pandocDocxToMdStep,
    copyDocxDependenciesStep,
    initMystConfigStep,
    extractDocxFrontmatterStep,
    extractDocxPartsStep,
    cleanPandocArtifactsStep,
    improveDocxFiguresStep,
    improveDocxTablesStep,
    improveDocxCrossrefsStep,
    improveDocxMathStep,
    improveDocxCitationsStep,
    improveCitationTagsStep,
    enrichAffiliationsRorStep,
  ],
};
