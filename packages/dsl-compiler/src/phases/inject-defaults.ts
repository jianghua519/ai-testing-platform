import type { CompileContext } from '../types.js';

export const injectDefaults = (context: CompileContext): void => {
  if (!context.normalizedPlan) {
    throw new Error('normalize must run before injectDefaults');
  }

  // Defaults are materialized during normalize for this skeleton.
};
