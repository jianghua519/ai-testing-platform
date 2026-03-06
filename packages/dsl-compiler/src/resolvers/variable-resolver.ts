import type { CompileContext } from '../types.js';

export const seedVariables = (context: CompileContext): void => {
  context.symbolTable.variables = {
    ...(context.sourcePlan.variables ?? {}),
    ...(context.request.envProfile.variables ?? {}),
    ...(context.request.variableContext ?? {}),
  };
};
