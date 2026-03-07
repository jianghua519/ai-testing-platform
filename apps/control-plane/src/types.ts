import type { EnvProfile, WebStepPlanDraft } from '@aiwtp/web-dsl-schema';
import type {
  ResultReportedEnvelope,
  StepResultReportedEnvelope,
  StepResultPayload,
  StepControlResponse,
  StepControlRequest,
  WebWorkerJob,
} from '@aiwtp/web-worker';
import type { CompiledStep } from '@aiwtp/web-dsl-schema';

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

export interface ControlPlanePage<T> {
  items: T[];
  nextCursor?: string;
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
  name?: string | null;
  mode?: string | null;
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
  jobKind?: string | null;
  requiredCapabilities?: string[] | null;
  assignedAgentId?: string | null;
  leaseToken?: string | null;
  controlState?: string | null;
  controlReason?: string | null;
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

export interface ControlPlaneAgentRecord {
  agentId: string;
  tenantId: string;
  projectId: string | null;
  name: string;
  platform: string;
  architecture: string;
  runtimeKind: string;
  status: string;
  capabilities: string[];
  metadata: Record<string, unknown>;
  maxParallelSlots: number;
  lastHeartbeatAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ControlPlaneArtifactRecord {
  artifactId: string;
  tenantId: string;
  projectId: string;
  runId: string | null;
  runItemId: string | null;
  stepEventId: string | null;
  jobId: string | null;
  artifactType: string;
  storageUri: string;
  contentType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  metadata: Record<string, unknown>;
  retentionExpiresAt: string | null;
  createdAt: string;
}

export interface ControlPlaneJobLeaseRecord {
  leaseId: number;
  leaseToken: string;
  jobId: string;
  runId: string;
  runItemId: string;
  agentId: string;
  attemptNo: number;
  status: string;
  acquiredAt: string;
  expiresAt: string;
  heartbeatAt: string | null;
  releasedAt: string | null;
}

export interface ControlPlaneListRunsQuery {
  tenantId: string;
  projectId: string;
  limit: number;
  cursor?: string;
}

export interface ControlPlaneListRunItemsQuery {
  runId: string;
  limit: number;
  cursor?: string;
}

export interface ControlPlaneListStepEventsQuery {
  limit: number;
  cursor?: string;
}

export interface ControlPlaneListArtifactsQuery {
  limit: number;
  cursor?: string;
}

export interface ControlPlaneListExpiredArtifactsQuery {
  limit: number;
  expiresBefore?: string;
}

export interface ControlPlaneEnqueueWebRunInput {
  tenantId: string;
  projectId: string;
  name: string;
  mode?: string;
  plan: WebStepPlanDraft;
  envProfile: EnvProfile;
  requiredCapabilities?: string[];
  variableContext?: Record<string, unknown>;
  traceId?: string;
  correlationId?: string;
}

export interface ControlPlaneEnqueueWebRunResult {
  run: ControlPlaneRunRecord;
  runItem: ControlPlaneRunItemRecord;
  job: WebWorkerJob;
}

export interface ControlPlaneRegisterAgentInput {
  agentId: string;
  tenantId: string;
  projectId?: string;
  name: string;
  platform: string;
  architecture: string;
  runtimeKind: string;
  capabilities: string[];
  metadata?: Record<string, unknown>;
  status?: string;
  maxParallelSlots?: number;
}

export interface ControlPlaneHeartbeatAgentInput {
  status?: string;
  capabilities?: string[];
  metadata?: Record<string, unknown>;
  maxParallelSlots?: number;
}

export interface ControlPlaneAcquireLeaseInput {
  supportedJobKinds: string[];
  leaseTtlSeconds: number;
}

export interface ControlPlaneAcquireLeaseResult {
  lease: ControlPlaneJobLeaseRecord;
  job: WebWorkerJob;
}

export interface ControlPlaneHeartbeatLeaseInput {
  leaseTtlSeconds: number;
}

export interface ControlPlaneCompleteLeaseInput {
  status: 'succeeded' | 'failed' | 'canceled';
}

export type ControlPlaneRunControlAction = 'pause' | 'resume' | 'cancel';

export interface ControlPlaneSchedulingStore {
  enqueueWebRun(input: ControlPlaneEnqueueWebRunInput): Promise<ControlPlaneEnqueueWebRunResult>;
  registerAgent(input: ControlPlaneRegisterAgentInput): Promise<ControlPlaneAgentRecord>;
  heartbeatAgent(agentId: string, input: ControlPlaneHeartbeatAgentInput): Promise<ControlPlaneAgentRecord | undefined>;
  acquireLease(agentId: string, input: ControlPlaneAcquireLeaseInput): Promise<ControlPlaneAcquireLeaseResult | undefined>;
  heartbeatLease(leaseToken: string, input: ControlPlaneHeartbeatLeaseInput): Promise<ControlPlaneJobLeaseRecord | undefined>;
  completeLease(leaseToken: string, input: ControlPlaneCompleteLeaseInput): Promise<ControlPlaneJobLeaseRecord | undefined>;
  pauseRun?(runId: string): Promise<ControlPlaneRunRecord | undefined>;
  resumeRun?(runId: string): Promise<ControlPlaneRunRecord | undefined>;
  cancelRun?(runId: string): Promise<ControlPlaneRunRecord | undefined>;
}

export interface ControlPlaneStore extends Partial<ControlPlaneSchedulingStore> {
  recordRunnerEvent(envelope: RunnerResultEnvelope): Promise<RecordRunnerEventResult>;
  listJobEvents(jobId: string): Promise<RecordedRunnerEvent[]>;
  enqueueStepDecision(jobId: string, sourceStepId: string, decision: StepControlResponse): Promise<void>;
  dequeueStepDecision(jobId: string, sourceStepId: string): Promise<StepControlResponse | undefined>;
  listAppliedMigrations(): Promise<ControlPlaneMigrationRecord[]>;
  getRun(runId: string): Promise<ControlPlaneRunRecord | undefined>;
  listRuns(query: ControlPlaneListRunsQuery): Promise<ControlPlanePage<ControlPlaneRunRecord>>;
  getRunItem(runItemId: string): Promise<ControlPlaneRunItemRecord | undefined>;
  listRunItems(query: ControlPlaneListRunItemsQuery): Promise<ControlPlanePage<ControlPlaneRunItemRecord>>;
  listStepEventsByRun(runId: string, query: ControlPlaneListStepEventsQuery): Promise<ControlPlanePage<ControlPlaneStepEventRecord>>;
  listStepEventsByRunItem(runItemId: string, query: ControlPlaneListStepEventsQuery): Promise<ControlPlanePage<ControlPlaneStepEventRecord>>;
  listArtifactsByRun?(runId: string, query: ControlPlaneListArtifactsQuery): Promise<ControlPlanePage<ControlPlaneArtifactRecord>>;
  listArtifactsByRunItem?(runItemId: string, query: ControlPlaneListArtifactsQuery): Promise<ControlPlanePage<ControlPlaneArtifactRecord>>;
  getArtifact?(artifactId: string): Promise<ControlPlaneArtifactRecord | undefined>;
  listExpiredArtifacts?(query: ControlPlaneListExpiredArtifactsQuery): Promise<ControlPlaneArtifactRecord[]>;
  deleteArtifacts?(artifactIds: string[]): Promise<number>;
  resolveStepControlDecision?(
    jobId: string,
    runId: string,
    runItemId: string,
    sourceStepId: string,
  ): Promise<StepControlResponse | undefined>;
  snapshot(): Promise<ControlPlaneStateSnapshot>;
  close?(): Promise<void>;
}

export interface StepResultRecord {
  payload: StepResultPayload;
  envelope: StepResultReportedEnvelope;
}

export type StepDecisionRequest = StepControlRequest;
