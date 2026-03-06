import type { CompileContext } from '../types.js';
import { seedVariables } from '../resolvers/variable-resolver.js';

export const resolveReferences = (context: CompileContext): void => {
  if (!context.normalizedPlan) {
    throw new Error('normalize must run before resolveReferences');
  }

  seedVariables(context);
};
