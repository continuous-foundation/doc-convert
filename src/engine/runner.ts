import { plannedStepDisposition } from '../config/doc-convert-config.js';
import type { PipelineStep, RunContext, Ruleset, StepDisposition } from './types.js';
import { fileExists } from './context.js';

function dispositionLabel(d: StepDisposition): string {
  if (d === 'warn-skip') return 'warn-skip';
  return d;
}

export async function runRuleset(ruleset: Ruleset, ctx: RunContext): Promise<void> {
  const steps = ruleset.steps;
  const total = steps.length;

  console.log(`\nPipeline: ${ruleset.label}`);
  console.log(`Input:   ${ctx.inputAbs}`);
  console.log(`Workdir: ${ctx.workdirAbs}`);
  if (ctx.stepConfig) {
    console.log(`Config:  ${process.cwd()}/doc-convert.yml`);
  }
  console.log('');

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const n = i + 1;
    const disposition = plannedStepDisposition(step, ctx, ctx.stepConfig);

    if (disposition === 'skip') {
      console.log(`=== ${n}/${total} ${step.label} ===\n(skipped)\n`);
      continue;
    }

    if (disposition === 'warn-skip') {
      console.log(`=== ${n}/${total} ${step.label} ===\n(warn-skip: prerequisites not met)\n`);
      continue;
    }

    console.log(`=== ${n}/${total} ${step.label} ===`);
    await step.run(ctx);
    console.log('');

    if (ctx.options.dryRun && !fileExists(ctx.workdirAbs) && step.id === 'pandocDocxToMd') {
      console.log(
        '(dry-run: workdir not created; re-run without --dry-run to execute remaining steps.)\n',
      );
      return;
    }
  }

  if (ctx.options.dryRun && !fileExists(ctx.workdirAbs)) {
    console.log('(dry-run: workdir was not created.)\n');
    return;
  }

  console.log(`Done. Output is in ${ctx.workdirAbs}/\n`);
}

export function listRulesetSteps(ruleset: Ruleset, ctx: RunContext): void {
  console.log(`\nPipeline: ${ruleset.label}`);
  console.log(`Input:   ${ctx.inputAbs}`);
  if (ctx.stepConfig) {
    console.log(`Config:  ${process.cwd()}/doc-convert.yml`);
  }
  console.log('');
  ruleset.steps.forEach((step: PipelineStep, i) => {
    const d = plannedStepDisposition(step, ctx, ctx.stepConfig);
    console.log(`  ${i + 1}. [${dispositionLabel(d)}] ${step.id} — ${step.label}`);
  });
  console.log('');
}
