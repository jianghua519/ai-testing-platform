import type { ArtifactReference, CompileIssue, ExtractedVariable, PlanExecutionResult, StepResult } from '@aiwtp/web-dsl-schema';
import type { JobMetadata, WebWorkerResult } from '../job-runner/types.js';

export interface JobResultPayloadError {
  code: string;
  message: string;
  details?: unknown;
}

export interface JobResultPayload {
  job_id: string;
  run_id: string;
  run_item_id: string;
  attempt_no: number;
  status: 'passed' | 'failed' | 'canceled';
  started_at?: string;
  finished_at?: string;
  error?: JobResultPayloadError;
  artifacts?: ArtifactReference[];
  usage?: {
    duration_ms?: number;
    step_count?: number;
  };
}

export interface StepResultPayload {
  job_id: string;
  run_id: string;
  run_item_id: string;
  attempt_no: number;
  compiled_step_id: string;
  source_step_id: string;
  status: StepResult['status'];
  started_at: string;
  finished_at: string;
  duration_ms: number;
  error?: JobResultPayloadError;
  artifacts: ArtifactReference[];
  extracted_variables: ExtractedVariable[];
}

export interface ResultReportedEnvelope {
  event_id: string;
  event_type: 'job.result_reported';
  schema_version: string;
  occurred_at: string;
  tenant_id: string;
  project_id: string;
  trace_id: string;
  correlation_id?: string;
  payload: JobResultPayload;
}

export interface StepResultReportedEnvelope {
  event_id: string;
  event_type: 'step.result_reported';
  schema_version: string;
  occurred_at: string;
  tenant_id: string;
  project_id: string;
  trace_id: string;
  correlation_id?: string;
  payload: StepResultPayload;
}

export interface ResultPublisher {
  publish(result: WebWorkerResult): Promise<void>;
  publishStep(metadata: JobMetadata, stepResult: StepResult): Promise<void>;
}

export interface ResultEnvelopeFactory {
  buildJobResult(result: WebWorkerResult): ResultReportedEnvelope;
  buildStepResult(metadata: JobMetadata, stepResult: StepResult): StepResultReportedEnvelope;
}

export interface HttpResultPublisherConfig {
  endpoint: string;
  timeoutMs?: number;
  authToken?: string;
  additionalHeaders?: Record<string, string>;
}

export interface ResultPublisherFactory {
  create(): ResultPublisher;
}

export interface FailedResultContext {
  issues: CompileIssue[];
  planResult?: PlanExecutionResult;
}
