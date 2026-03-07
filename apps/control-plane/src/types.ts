import type { CompiledStep } from '@aiwtp/web-dsl-schema';
import type { ResultReportedEnvelope, StepResultReportedEnvelope, StepResultPayload, StepControlResponse, StepControlRequest } from '@aiwtp/web-worker';

export type RunnerResultEnvelope = ResultReportedEnvelope | StepResultReportedEnvelope;

export interface RecordedRunnerEvent {
  receivedAt: string;
  envelope: RunnerResultEnvelope;
}

export interface JobEventsResponse {
  items: RecordedRunnerEvent[];
}

export interface StepOverrideRequest {
  action: StepControlResponse['action'];
  reason?: string;
  replacement_step?: CompiledStep;
  resume_after_ms?: number;
}

export interface ControlPlaneServer {
  baseUrl: string;
  port: number;
  close(): Promise<void>;
}

export interface InMemoryControlPlaneStateSnapshot {
  eventsByJob: Record<string, RecordedRunnerEvent[]>;
  pendingDecisionsByJob: Record<string, Record<string, StepControlResponse[]>>;
}

export interface StepResultRecord {
  payload: StepResultPayload;
  envelope: StepResultReportedEnvelope;
}

export type StepDecisionRequest = StepControlRequest;
