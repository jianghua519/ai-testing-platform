import type { ArtifactReference, CompiledStep, ExtractedVariable, StepResult, StepExecutionStatus } from '@aiwtp/web-dsl-schema';
import type { ExecutionSession } from '../types.js';

interface StepResultOptions {
  step: CompiledStep;
  session: ExecutionSession;
  startedAt: Date;
  finishedAt: Date;
  status: StepExecutionStatus;
  attempts?: number;
  artifacts?: ArtifactReference[];
  extractedVariables?: ExtractedVariable[];
  errorCode?: string;
  errorMessage?: string;
}

export const buildStepResult = ({
  step,
  session,
  startedAt,
  finishedAt,
  status,
  attempts = 1,
  artifacts = [],
  extractedVariables = [],
  errorCode,
  errorMessage,
}: StepResultOptions): StepResult => ({
  compiledStepId: step.compiledStepId,
  sourceStepId: step.sourceStepId,
  status,
  startedAt: startedAt.toISOString(),
  finishedAt: finishedAt.toISOString(),
  durationMs: finishedAt.getTime() - startedAt.getTime(),
  attempts,
  locatorUsed: step.locatorResolved,
  artifacts,
  extractedVariables,
  errorCode,
  errorMessage,
});

export const buildSkippedStepResult = (step: CompiledStep, session: ExecutionSession, reason: string): StepResult => {
  const startedAt = session.clock.now();
  const finishedAt = session.clock.now();
  return buildStepResult({
    step,
    session,
    startedAt,
    finishedAt,
    status: 'skipped',
    attempts: 0,
    errorCode: 'PW_STEP_SKIPPED',
    errorMessage: reason,
  });
};

export const buildCanceledStepResult = (step: CompiledStep, session: ExecutionSession, reason: string): StepResult => {
  const startedAt = session.clock.now();
  const finishedAt = session.clock.now();
  return buildStepResult({
    step,
    session,
    startedAt,
    finishedAt,
    status: 'canceled',
    attempts: 0,
    errorCode: 'PW_STEP_CANCELED',
    errorMessage: reason,
  });
};
