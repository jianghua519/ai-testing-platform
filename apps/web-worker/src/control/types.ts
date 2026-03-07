import type { CompiledStep } from '@aiwtp/web-dsl-schema';
import type { StepExecutionController } from '@aiwtp/playwright-adapter';
import type { JobMetadata } from '../job-runner/types.js';

export interface StepControlRequest {
  job_id: string;
  run_id: string;
  run_item_id: string;
  attempt_no: number;
  tenant_id: string;
  project_id: string;
  trace_id: string;
  correlation_id?: string;
  compiled_step_id: string;
  source_step_id: string;
  step_name: string;
  page_url?: string;
  compiled_step: CompiledStep;
}

export interface StepControlResponse {
  action: 'execute' | 'skip' | 'replace' | 'pause' | 'cancel';
  reason?: string;
  replacement_step?: CompiledStep;
  resume_after_ms?: number;
}

export interface HttpStepControllerConfig {
  endpoint: string;
  timeoutMs?: number;
  authToken?: string;
  additionalHeaders?: Record<string, string>;
  pausePollIntervalMs?: number;
  failOpen?: boolean;
}

export interface StepControllerFactory {
  create(metadata: JobMetadata): StepExecutionController;
}

export type StepControllerProvider = StepExecutionController | StepControllerFactory;
