import { WEB_DSL_SCHEMA_VERSION, type CompiledWebPlan } from '@aiwtp/web-dsl-schema';
import type { CompileContext } from '../types.js';
import { bindStep } from '../binders/step-binder.js';

export const bindExecution = (context: CompileContext): void => {
  if (!context.normalizedPlan) {
    throw new Error('normalize must run before bindExecution');
  }

  const compiledPlan: CompiledWebPlan = {
    compiledPlanId: `compiled-${context.normalizedPlan.planId}`,
    sourcePlanId: context.normalizedPlan.planId,
    sourceVersion: context.normalizedPlan.version,
    browserProfile: context.normalizedPlan.browserProfile,
    runtimeVariables: context.symbolTable.variables,
    compiledSteps: context.normalizedPlan.steps.map((step) => bindStep(context, step)),
    compileDigest: {
      sourcePlanId: context.normalizedPlan.planId,
      sourceVersion: context.normalizedPlan.version,
      compilerVersion: WEB_DSL_SCHEMA_VERSION,
      compiledAt: new Date().toISOString(),
      normalizedStepCount: 0,
      warningCount: 0,
    },
  };

  context.compiledPlan = compiledPlan;
};
