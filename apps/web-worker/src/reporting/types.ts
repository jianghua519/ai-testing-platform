import type { ArtifactReference, CompileIssue, PlanExecutionResult } from '@aiwtp/web-dsl-schema';
import type { WebWorkerResult } from '../job-runner/types.js';

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

export interface ResultPublisher {
  publish(result: WebWorkerResult): Promise<void>;
}

export interface ResultEnvelopeFactory {
  build(result: WebWorkerResult): ResultReportedEnvelope;
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
