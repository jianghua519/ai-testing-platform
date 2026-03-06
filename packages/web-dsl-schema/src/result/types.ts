import type { ResolvedLocator } from '../compiled/types.js';

export type StepExecutionStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped' | 'error';

export interface ArtifactReference {
  kind: 'screenshot' | 'trace' | 'video' | 'dom_snapshot' | 'network_capture';
  uri: string;
}

export interface ExtractedVariable {
  name: string;
  value: unknown;
}

export interface StepResult {
  compiledStepId: string;
  sourceStepId: string;
  status: StepExecutionStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  attempts: number;
  locatorUsed?: ResolvedLocator;
  artifacts: ArtifactReference[];
  extractedVariables: ExtractedVariable[];
  errorCode?: string;
  errorMessage?: string;
}

export interface PlanExecutionResult {
  compiledPlanId: string;
  status: 'passed' | 'failed' | 'error';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  stepResults: StepResult[];
}
