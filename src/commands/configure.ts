import type { Command } from 'commander';
import { writeDocConvertConfig } from '../config/doc-convert-config.js';
import { docxRuleset } from '../rulesets/docx.js';

export function addConfigureCommand(program: Command): void {
  program
    .command('configure')
    .description(`Write ${'doc-convert.yml'} to the current directory`)
    .option('-f, --force', 'Overwrite an existing configuration file')
    .addHelpText(
      'after',
      `
Examples:
  $ doc-convert configure
  $ doc-convert configure --force
`,
    )
    .action((opts: { force?: boolean }) => {
      const outPath = writeDocConvertConfig(process.cwd(), docxRuleset, {
        force: Boolean(opts.force),
      });
      console.log(`Wrote ${outPath}\n`);
    });
}
