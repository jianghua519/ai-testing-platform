import type { ResolvedLocator } from '../compiled/types.js';

export type StepExecutionStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped' | 'canceled' | 'error';

export interface ArtifactReference {
  artifactId?: string;
  kind: 'screenshot' | 'trace' | 'video' | 'dom_snapshot' | 'network_capture';
  uri: string;
  contentType?: string;
  sizeBytes?: number;
  sha256?: string;
  retentionExpiresAt?: string;
  metadata?: Record<string, unknown>;
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
  status: 'passed' | 'failed' | 'canceled' | 'error';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  artifacts: ArtifactReference[];
  stepResults: StepResult[];
}
