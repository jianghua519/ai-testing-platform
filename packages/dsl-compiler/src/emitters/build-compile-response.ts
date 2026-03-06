import type { CompileContext, CompileResponse } from '../types.js';

export const buildCompileResponse = (context: CompileContext): CompileResponse => {
  const issues = context.diagnostics.getIssues();
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;

  return {
    compiledPlan: errorCount > 0 ? undefined : context.compiledPlan,
    issues,
    stats: {
      ...context.stats,
      warningCount,
      errorCount,
    },
  };
};
