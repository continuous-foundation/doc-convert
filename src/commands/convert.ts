import path from 'node:path';
import type { Command } from 'commander';
import { CliError } from '../cli/errors.js';
import {
  assertDocxInput,
  buildRunContext,
  fileExists,
  parseConvertOptions,
  resolveInputPath,
} from '../engine/context.js';
import { listRulesetSteps, runRuleset } from '../engine/runner.js';
import { docxRuleset } from '../rulesets/docx.js';

export function addConvertCommand(program: Command): void {
  program
    .argument('<input>', 'Input Word document (.docx)')
    .option('--workdir <path>', 'Output workdir name or path', '_improved')
    .option('--project-root <path>', 'Project root for optional assets (default: input directory)')
    .option('-d, --dry-run', 'Do not write files')
    .option('--ror-lookup', 'Enable ROR affiliation lookups (default on)')
    .option('--no-ror-lookup', 'Disable ROR affiliation lookups')
    .option('--ror-min-score <float>', 'ROR match threshold 0..1', '0.8')
    .option('--list-steps', 'Print planned pipeline steps and exit')
    .addHelpText(
      'after',
      `
Examples:
  $ doc-convert manuscript.docx
  $ doc-convert manuscript.docx --project-root ./article --workdir _improved
  $ doc-convert manuscript.docx --list-steps
`,
    )
    .action(async (input: string, opts) => {
      const inputAbs = resolveInputPath(input);
      if (!fileExists(inputAbs)) {
        throw new CliError(`Input file not found: ${inputAbs}`);
      }

      assertDocxInput(inputAbs);

      const options = parseConvertOptions({
        dryRun: opts.dryRun,
        workdir: opts.workdir,
        rorLookup: opts.rorLookup,
        noRorLookup: opts.noRorLookup,
        rorMinScore: opts.rorMinScore,
        projectRoot: opts.projectRoot,
      });

      const ctx = buildRunContext(inputAbs, options);
      if (!opts.projectRoot) {
        ctx.projectRoot = path.dirname(inputAbs);
      }

      if (opts.listSteps) {
        listRulesetSteps(docxRuleset, ctx);
        return;
      }

      await runRuleset(docxRuleset, ctx);
    });
}
