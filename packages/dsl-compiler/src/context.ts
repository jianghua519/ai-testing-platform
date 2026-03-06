import type { CompileRequest, CompileContext, CompileStats, SymbolTable } from './types.js';
import { BasicDiagnosticCollector } from './diagnostics/collector.js';

const createEmptyStats = (sourceStepCount: number): CompileStats => ({
  sourceStepCount,
  normalizedStepCount: 0,
  warningCount: 0,
  errorCount: 0,
});

const createEmptySymbolTable = (): SymbolTable => ({
  variables: {},
});

export const createCompileContext = (request: CompileRequest): CompileContext => ({
  request,
  sourcePlan: request.sourcePlan,
  issues: [],
  symbolTable: createEmptySymbolTable(),
  diagnostics: new BasicDiagnosticCollector(),
  stats: createEmptyStats(request.sourcePlan.steps.length),
});
