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

export interface ControlPlaneStateSnapshot {
  eventsByJob: Record<string, RecordedRunnerEvent[]>;
  pendingDecisionsByJob: Record<string, Record<string, StepControlResponse[]>>;
  receivedEventIds: string[];
}

export interface RecordRunnerEventResult {
  duplicate: boolean;
}

export interface ControlPlaneMigrationRecord {
  version: string;
  checksum: string;
  appliedAt: string;
}

export interface ControlPlaneRunRecord {
  runId: string;
  tenantId: string;
  projectId: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  lastEventId: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ControlPlaneRunItemRecord {
  runItemId: string;
  runId: string;
  jobId: string;
  tenantId: string;
  projectId: string;
  attemptNo: number;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  lastEventId: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ControlPlaneStepEventRecord {
  eventId: string;
  runId: string;
  runItemId: string;
  jobId: string;
  tenantId: string;
  projectId: string;
  attemptNo: number;
  compiledStepId: string;
  sourceStepId: string;
  status: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  errorCode: string | null;
  errorMessage: string | null;
  artifacts: unknown[];
  extractedVariables: unknown[];
  receivedAt: string;
}

export interface ControlPlaneStore {
  recordRunnerEvent(envelope: RunnerResultEnvelope): Promise<RecordRunnerEventResult>;
  listJobEvents(jobId: string): Promise<RecordedRunnerEvent[]>;
  enqueueStepDecision(jobId: string, sourceStepId: string, decision: StepControlResponse): Promise<void>;
  dequeueStepDecision(jobId: string, sourceStepId: string): Promise<StepControlResponse | undefined>;
  listAppliedMigrations(): Promise<ControlPlaneMigrationRecord[]>;
  getRun(runId: string): Promise<ControlPlaneRunRecord | undefined>;
  getRunItem(runItemId: string): Promise<ControlPlaneRunItemRecord | undefined>;
  listStepEvents(runItemId: string): Promise<ControlPlaneStepEventRecord[]>;
  snapshot(): Promise<ControlPlaneStateSnapshot>;
  close?(): Promise<void>;
}

export interface StepResultRecord {
  payload: StepResultPayload;
  envelope: StepResultReportedEnvelope;
}

export type StepDecisionRequest = StepControlRequest;
