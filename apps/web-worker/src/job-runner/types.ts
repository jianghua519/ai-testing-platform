import type { CompileIssue, EnvProfile, PlanExecutionResult, WebStepPlanDraft } from '@aiwtp/web-dsl-schema';

export interface WebWorkerJob {
  jobId: string;
  tenantId: string;
  projectId: string;
  runId: string;
  runItemId: string;
  attemptNo: number;
  traceId: string;
  correlationId?: string;
  plan: WebStepPlanDraft;
  envProfile: EnvProfile;
  variableContext?: Record<string, unknown>;
}

export interface JobMetadata {
  jobId: string;
  runId: string;
  runItemId: string;
  attemptNo: number;
  tenantId: string;
  projectId: string;
  traceId: string;
  correlationId?: string;
}

export interface WebWorkerResult {
  metadata: JobMetadata;
  status: 'compiled' | 'executed' | 'compile_failed' | 'execution_failed';
  issues: CompileIssue[];
  planResult?: PlanExecutionResult;
}
