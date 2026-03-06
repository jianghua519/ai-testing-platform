import type {
  ArtifactPolicy,
  CompiledWebPlan,
  CompileIssue,
  DatasetRecord,
  EnvProfile,
  RetryPolicy,
  WebStepPlanDraft,
  WebStepDraft,
} from '@aiwtp/web-dsl-schema';

export interface CompileOptions {
  failOnWarning?: boolean;
}

export interface CompileStats {
  sourceStepCount: number;
  normalizedStepCount: number;
  warningCount: number;
  errorCount: number;
}

export interface CompileRequest {
  sourcePlan: WebStepPlanDraft;
  envProfile: EnvProfile;
  dataset?: DatasetRecord[];
  variableContext?: Record<string, unknown>;
  compileOptions?: CompileOptions;
}

export interface CompileResponse {
  compiledPlan?: CompiledWebPlan;
  issues: CompileIssue[];
  stats: CompileStats;
}

export interface NormalizedStep extends Omit<WebStepDraft, 'children' | 'retryPolicy' | 'artifactPolicy'> {
  timeoutMs: number;
  retryPolicy: RetryPolicy;
  artifactPolicy: ArtifactPolicy;
  children: NormalizedStep[];
}

export interface NormalizedPlan extends Omit<WebStepPlanDraft, 'steps' | 'defaults'> {
  defaults: {
    timeoutMs: number;
    retryPolicy: RetryPolicy;
    artifactPolicy: ArtifactPolicy;
  };
  steps: NormalizedStep[];
}

export interface SymbolTable {
  variables: Record<string, unknown>;
}

export interface DiagnosticCollector {
  add(issue: CompileIssue): void;
  hasErrors(): boolean;
  getIssues(): CompileIssue[];
}

export interface CompileContext {
  request: CompileRequest;
  sourcePlan: WebStepPlanDraft;
  normalizedPlan?: NormalizedPlan;
  compiledPlan?: CompiledWebPlan;
  issues: CompileIssue[];
  symbolTable: SymbolTable;
  diagnostics: DiagnosticCollector;
  stats: CompileStats;
}

export interface DslCompiler {
  compile(request: CompileRequest): Promise<CompileResponse>;
  validate(request: CompileRequest): Promise<CompileIssue[]>;
}
