import type { CompiledStep } from '@aiwtp/web-dsl-schema';
import type { CompileContext } from '../types.js';

const countSteps = (steps: CompiledStep[]): number =>
  steps.reduce((sum, step) => sum + 1 + countSteps(step.children), 0);

export const finalize = (context: CompileContext): void => {
  if (!context.compiledPlan) {
    return;
  }

  const normalizedStepCount = countSteps(context.compiledPlan.compiledSteps);
  const warningCount = context.diagnostics.getIssues().filter((issue) => issue.severity === 'warning').length;

  context.compiledPlan = {
    ...context.compiledPlan,
    compileDigest: {
      ...context.compiledPlan.compileDigest,
      normalizedStepCount,
      warningCount,
    },
  };

  context.stats = {
    ...context.stats,
    normalizedStepCount,
    warningCount,
    errorCount: context.diagnostics.getIssues().filter((issue) => issue.severity === 'error').length,
  };
};
