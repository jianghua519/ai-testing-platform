import type { CompileIssue, EnvProfile, PlanExecutionResult, WebStepPlanDraft } from '@aiwtp/web-dsl-schema';

export interface WebWorkerJob {
  jobId: string;
  tenantId: string;
  projectId: string;
  runId: string;
  plan: WebStepPlanDraft;
  envProfile: EnvProfile;
  variableContext?: Record<string, unknown>;
}

export interface JobMetadata {
  jobId: string;
  runId: string;
  tenantId: string;
  projectId: string;
}

export interface WebWorkerResult {
  metadata: JobMetadata;
  status: 'compiled' | 'executed' | 'compile_failed' | 'execution_failed';
  issues: CompileIssue[];
  planResult?: PlanExecutionResult;
}
