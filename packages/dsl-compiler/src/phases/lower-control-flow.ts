import type { CompileContext } from '../types.js';
import { lowerChildren } from '../lowering/noop-lowering.js';

export const lowerControlFlow = (context: CompileContext): void => {
  if (!context.normalizedPlan) {
    throw new Error('normalize must run before lowerControlFlow');
  }

  context.normalizedPlan = {
    ...context.normalizedPlan,
    steps: lowerChildren(context.normalizedPlan.steps),
  };
};
