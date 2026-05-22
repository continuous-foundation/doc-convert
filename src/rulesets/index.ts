import path from 'node:path';
import type { Ruleset, RulesetId } from '../engine/types.js';
import { docxRuleset } from './docx.js';
import { jupytextRuleset } from './jupytext.js';
import { markdownRuleset } from './markdown.js';

export function inferRulesetId(inputAbs: string, jupytextFlag: boolean): RulesetId {
  const ext = path.extname(inputAbs).toLowerCase();
  if (ext === '.docx') return 'docx';
  if (ext === '.md' || ext === '.markdown') {
    return jupytextFlag ? 'jupytext' : 'markdown';
  }
  throw new Error(
    `Unsupported input extension "${ext}". Use .md (or --jupytext), or .docx.`,
  );
}

export function getRuleset(id: RulesetId): Ruleset {
  switch (id) {
    case 'jupytext':
      return jupytextRuleset;
    case 'markdown':
      return markdownRuleset;
    case 'docx':
      return docxRuleset;
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

export { jupytextRuleset, markdownRuleset, docxRuleset };
