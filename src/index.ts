#!/usr/bin/env node
import { Command } from 'commander';
import { addConvertCommand } from './commands/convert.js';
import { handleCliFailure } from './cli/errors.js';
import version from './version.js';

(process as NodeJS.Process & { noDeprecation?: boolean }).noDeprecation = true;

const program = new Command();
program.name('doc-convert');
program.description(
  'Convert and improve documents into a MyST-ready project (myst.yml + article.md).',
);
program.showHelpAfterError(true);

addConvertCommand(program);

program.version(`v${version}`, '-v, --version', 'Print the current version of doc-convert');

program.exitOverride();

async function main(): Promise<void> {
  await program.parseAsync(process.argv);
}

main().catch(handleCliFailure);
