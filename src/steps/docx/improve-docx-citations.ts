import type { PipelineStep, StepDisposition } from '../../engine/types.js';
import { stepOpts } from '../../engine/step-context.js';
import { detectCitationDialect, improveDocxCitations } from '../shared/citations/docx-citations.js';
import fs from 'node:fs';
import path from 'node:path';

function whenDocxCitations(ctx: { workdirAbs: string }): StepDisposition {
  const articlePath = path.join(ctx.workdirAbs, 'article.md');
  if (!fs.existsSync(articlePath)) return 'skip';
  const md = fs.readFileSync(articlePath, 'utf8');
  return detectCitationDialect(md) === 'none' ? 'warn-skip' : 'run';
}

export const improveDocxCitationsStep: PipelineStep = {
  id: 'improveDocxCitations',
  label: 'Normalize DOCX citations to BibTeX + MyST cites',
  inputs: ['markdown', 'bibtex', 'myst'],
  when: whenDocxCitations,
  run: async (ctx) => {
    const o = stepOpts(ctx);
    await improveDocxCitations({
      article: 'article.md',
      bib: 'references.bib',
      myst: 'myst.yml',
      dryRun: o.dryRun,
      cwd: o.cwd,
    });
  },
};
