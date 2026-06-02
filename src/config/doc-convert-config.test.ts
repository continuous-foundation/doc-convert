import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  defaultDocConvertConfig,
  isStepEnabledInConfig,
  loadDocConvertConfig,
  plannedStepDisposition,
  serializeDocConvertConfig,
} from './doc-convert-config.js';
import { REQUIRED_STEP_ID } from './constants.js';
import { docxRuleset } from '../rulesets/docx.js';

describe('doc-convert config', () => {
  test('default config enables all configurable steps', () => {
    const config = defaultDocConvertConfig(docxRuleset);
    expect(config.steps[REQUIRED_STEP_ID]).toBeUndefined();
    for (const step of docxRuleset.steps) {
      if (step.id === REQUIRED_STEP_ID) continue;
      expect(config.steps[step.id]).toBe('run');
      expect(isStepEnabledInConfig(config, step.id)).toBe(true);
    }
  });

  test('no config file behaves like all steps enabled', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-convert-config-'));
    expect(loadDocConvertConfig(dir, docxRuleset)).toBeNull();
    expect(isStepEnabledInConfig(null, 'improveDocxFigures')).toBe(true);
  });

  test('missing step keys are skipped when config exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-convert-config-'));
    fs.writeFileSync(
      path.join(dir, 'doc-convert.yml'),
      'version: 1\nsteps:\n  improveDocxFigures: run\n',
      'utf8',
    );
    const config = loadDocConvertConfig(dir, docxRuleset);
    expect(isStepEnabledInConfig(config, 'improveDocxFigures')).toBe(true);
    expect(isStepEnabledInConfig(config, 'improveDocxTables')).toBe(false);
  });

  test('skip action disables step', () => {
    const config = defaultDocConvertConfig(docxRuleset);
    config.steps.improveDocxMath = 'skip';
    expect(isStepEnabledInConfig(config, 'improveDocxMath')).toBe(false);
    const step = docxRuleset.steps.find((s) => s.id === 'improveDocxMath')!;
    const ctx = {
      inputAbs: '/tmp/in.docx',
      projectRoot: '/tmp',
      workdir: '_improved',
      workdirAbs: '/tmp/_improved',
      articleMd: '/tmp/_improved/article.md',
      mystYml: '/tmp/_improved/myst.yml',
      options: { dryRun: false, workdir: '_improved', rorLookup: true, rorMinScore: 0.8 },
    };
    expect(plannedStepDisposition(step, ctx, config)).toBe('skip');
  });

  test('serialize omits pandoc step', () => {
    const yaml = serializeDocConvertConfig(defaultDocConvertConfig(docxRuleset));
    expect(yaml).not.toContain('pandocDocxToMd:');
    expect(yaml).toContain('improveDocxFigures: run');
  });
});
