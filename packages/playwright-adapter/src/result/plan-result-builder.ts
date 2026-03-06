import type { CompiledWebPlan, PlanExecutionResult, StepResult } from '@aiwtp/web-dsl-schema';

export const buildPlanResult = (plan: CompiledWebPlan, stepResults: StepResult[], startedAt: Date, finishedAt: Date): PlanExecutionResult => ({
  compiledPlanId: plan.compiledPlanId,
  status: stepResults.some((result) => result.status === 'failed' || result.status === 'error') ? 'failed' : 'passed',
  startedAt: startedAt.toISOString(),
  finishedAt: finishedAt.toISOString(),
  durationMs: finishedAt.getTime() - startedAt.getTime(),
  stepResults,
});
