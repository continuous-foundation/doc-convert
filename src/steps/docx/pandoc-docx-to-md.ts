import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { PipelineStep } from '../../engine/types.js';

function pandocAvailable(): boolean {
  const res = spawnSync('pandoc', ['--version'], { encoding: 'utf8' });
  return res.status === 0;
}

export const pandocDocxToMdStep: PipelineStep = {
  id: 'pandocDocxToMd',
  label: 'Convert DOCX to Markdown via Pandoc',
  run: async (ctx) => {
    if (!pandocAvailable()) {
      console.error(
        [
          'Pandoc is required for DOCX conversion but was not found on PATH.',
          '',
          'Install Pandoc:',
          '  macOS:  brew install pandoc',
          '  Ubuntu: sudo apt install pandoc',
          '  https://pandoc.org/installing.html',
          '',
        ].join('\n'),
      );
      process.exit(1);
    }

    const { workdirAbs, inputAbs, options } = ctx;
    const outMd = path.join(workdirAbs, 'article.md');

    if (!options.dryRun) {
      fs.mkdirSync(workdirAbs, { recursive: true });
    }

    // Extract embedded images to ./media/ so paths like media/image1.jpeg resolve in the workdir.
    const args = [
      '-f',
      'docx',
      '-t',
      'markdown',
      '--extract-media=.',
      '-o',
      outMd,
      inputAbs,
    ];
    console.log(`$ pandoc ${args.join(' ')}`);

    if (options.dryRun) {
      console.log('[dry-run] would run pandoc');
      return;
    }

    const res = spawnSync('pandoc', args, {
      cwd: workdirAbs,
      stdio: 'inherit',
      encoding: 'utf8',
    });
    if (res.error) throw res.error;
    if (res.status !== 0) {
      throw new Error(`pandoc failed with exit code ${res.status ?? 1}`);
    }
  },
};
