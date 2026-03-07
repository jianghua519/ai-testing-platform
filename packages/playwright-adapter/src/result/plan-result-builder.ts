import type { ArtifactReference, CompiledWebPlan, PlanExecutionResult, StepResult } from '@aiwtp/web-dsl-schema';

const toPlanStatus = (stepResults: StepResult[]): PlanExecutionResult['status'] => {
  if (stepResults.some((result) => result.status === 'canceled')) {
    return 'canceled';
  }
  if (stepResults.some((result) => result.status === 'failed' || result.status === 'error')) {
    return 'failed';
  }
  return 'passed';
};

export const buildPlanResult = (
  plan: CompiledWebPlan,
  stepResults: StepResult[],
  startedAt: Date,
  finishedAt: Date,
  artifacts: ArtifactReference[] = [],
): PlanExecutionResult => ({
  compiledPlanId: plan.compiledPlanId,
  status: toPlanStatus(stepResults),
  startedAt: startedAt.toISOString(),
  finishedAt: finishedAt.toISOString(),
  durationMs: finishedAt.getTime() - startedAt.getTime(),
  artifacts,
  stepResults,
});
