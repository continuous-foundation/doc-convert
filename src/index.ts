#!/usr/bin/env node
import { Command } from 'commander';
import version from './version.js';
import { addConvertCommand } from './commands/convert.js';

(process as NodeJS.Process & { noDeprecation?: boolean }).noDeprecation = true;

const program = new Command();
program.name('doc-convert');
program.description(
  'Convert and improve documents into a MyST-ready project (myst.yml + article.md).',
);

addConvertCommand(program);

program.version(`v${version}`, '-v, --version', 'Print the current version of doc-convert');
program.parse(process.argv);
