export type StepDisposition = 'run' | 'skip' | 'warn-skip';

export type StepConfigAction = 'run' | 'skip';

export interface DocConvertConfig {
  version: number;
  steps: Record<string, StepConfigAction>;
}

export interface ConvertOptions {
  dryRun: boolean;
  workdir: string;
  rorLookup: boolean;
  rorMinScore: number;
  projectRoot?: string;
}

export interface RunContext {
  inputAbs: string;
  projectRoot: string;
  workdir: string;
  workdirAbs: string;
  articleMd: string;
  mystYml: string;
  options: ConvertOptions;
  /** Loaded from cwd/doc-convert.yml when present; otherwise undefined (all steps enabled). */
  stepConfig?: DocConvertConfig | null;
}

export interface PipelineStep {
  id: string;
  label: string;
  when?: (ctx: RunContext) => StepDisposition;
  run: (ctx: RunContext) => Promise<void>;
}

export interface Ruleset {
  label: string;
  steps: PipelineStep[];
}
