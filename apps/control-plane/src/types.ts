import type { EnvProfile, LocatorDraft, WebStepPlanDraft } from '@aiwtp/web-dsl-schema';
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
  tenant_id?: string;
  run_id?: string;
  run_item_id?: string;
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
  selectionKind?: string | null;
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
  testCaseId?: string | null;
  testCaseVersionId?: string | null;
  dataTemplateVersionId?: string | null;
  datasetRowId?: string | null;
  inputSnapshot?: Record<string, unknown> | null;
  sourceRecordingId?: string | null;
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

export interface ControlPlaneListTestCasesQuery {
  tenantId: string;
  projectId: string;
  limit: number;
  cursor?: string;
}

export interface ControlPlaneListTestCaseVersionsQuery {
  testCaseId: string;
  limit: number;
  cursor?: string;
}

export interface ControlPlaneListDatasetRowsQuery {
  testCaseVersionId: string;
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

export interface ControlPlaneAuthenticatedActor {
  subjectId: string;
  tenantId: string;
}

export interface ControlPlanePrincipalProjectGrant {
  projectId: string;
  roles: string[];
}

export interface ControlPlanePrincipal {
  subjectId: string;
  tenantId: string;
  projectIds: string[];
  roles: string[];
  projectGrants: ControlPlanePrincipalProjectGrant[];
}

export interface ControlPlaneTemplateFieldRecord {
  key: string;
  sourceType: 'variable_ref' | 'file_ref' | 'loop_source_ref';
  valueType: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'file' | 'unknown';
  required: boolean;
}

export interface ControlPlaneTemplateSchemaRecord {
  fields: ControlPlaneTemplateFieldRecord[];
}

export interface ControlPlaneDataTemplateVersionRecord {
  dataTemplateId: string;
  dataTemplateVersionId: string;
  testCaseId: string;
  tenantId: string;
  projectId: string;
  versionNo: number;
  schema: ControlPlaneTemplateSchemaRecord;
  validationRules: Record<string, unknown>;
  defaultDatasetRowId?: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface ControlPlaneDatasetRowRecord {
  datasetRowId: string;
  testCaseId: string;
  dataTemplateVersionId: string;
  tenantId: string;
  projectId: string;
  name: string;
  status: string;
  values: Record<string, unknown>;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ControlPlaneTestCaseRecord {
  testCaseId: string;
  tenantId: string;
  projectId: string;
  dataTemplateId: string;
  name: string;
  status: string;
  latestVersionId: string | null;
  latestPublishedVersionId: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ControlPlaneTestCaseVersionRecord {
  testCaseVersionId: string;
  testCaseId: string;
  tenantId: string;
  projectId: string;
  versionNo: number;
  versionLabel: string | null;
  status: string;
  plan: WebStepPlanDraft;
  envProfile: EnvProfile;
  dataTemplateId: string;
  dataTemplateVersionId: string;
  defaultDatasetRowId: string | null;
  sourceRecordingId: string | null;
  sourceRunId: string | null;
  derivedFromCaseVersionId: string | null;
  changeSummary: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface ControlPlaneRecordingRecord {
  recordingId: string;
  tenantId: string;
  projectId: string;
  name: string;
  status: string;
  sourceType: 'manual' | 'auto_explore' | 'run_replay';
  envProfile: EnvProfile;
  startedAt: string;
  finishedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ControlPlaneRecordingAnalysisJobRecord {
  recordingAnalysisJobId: string;
  recordingId: string;
  tenantId: string;
  projectId: string;
  status: string;
  dslPlan: WebStepPlanDraft | null;
  structuredPlan: Record<string, unknown>;
  dataTemplateDraft: ControlPlaneTemplateSchemaRecord;
  startedAt: string;
  finishedAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface ControlPlaneCreateTestCaseInput {
  tenantId: string;
  projectId: string;
  name: string;
  plan: WebStepPlanDraft;
  envProfile: EnvProfile;
  versionLabel?: string;
  changeSummary?: string;
  publish?: boolean;
  sourceRecordingId?: string;
  sourceRunId?: string;
  derivedFromCaseVersionId?: string;
  defaultDataset?: {
    name?: string;
    values?: Record<string, unknown>;
  };
}

export interface ControlPlaneCreateTestCaseResult {
  testCase: ControlPlaneTestCaseRecord;
  version: ControlPlaneTestCaseVersionRecord;
  dataTemplateVersion: ControlPlaneDataTemplateVersionRecord;
  defaultDatasetRow: ControlPlaneDatasetRowRecord;
}

export interface ControlPlaneUpdateTestCaseInput {
  name?: string;
  status?: 'draft' | 'active' | 'archived';
}

export interface ControlPlaneCreateTestCaseVersionInput {
  plan: WebStepPlanDraft;
  envProfile: EnvProfile;
  versionLabel?: string;
  changeSummary?: string;
  publish?: boolean;
  sourceRecordingId?: string;
  sourceRunId?: string;
  derivedFromCaseVersionId?: string;
  defaultDataset?: {
    name?: string;
    values?: Record<string, unknown>;
  };
}

export interface ControlPlaneCreateTestCaseVersionResult {
  testCase: ControlPlaneTestCaseRecord;
  version: ControlPlaneTestCaseVersionRecord;
  dataTemplateVersion: ControlPlaneDataTemplateVersionRecord;
  defaultDatasetRow: ControlPlaneDatasetRowRecord;
}

export interface ControlPlaneCreateDatasetRowInput {
  name?: string;
  values: Record<string, unknown>;
}

export interface ControlPlaneUpdateDatasetRowInput {
  name?: string;
  values?: Record<string, unknown>;
}

export interface ControlPlaneCreateRecordingInput {
  tenantId: string;
  projectId: string;
  name: string;
  sourceType: 'manual' | 'auto_explore' | 'run_replay';
  envProfile: EnvProfile;
  startedAt?: string;
  finishedAt?: string;
}

export interface ControlPlaneCreateRecordingEventInput {
  eventType: string;
  pageUrl?: string;
  locator?: LocatorDraft;
  payload?: Record<string, unknown>;
  capturedAt?: string;
}

export interface ControlPlanePublishRecordingInput {
  name?: string;
  versionLabel?: string;
  changeSummary?: string;
  publish?: boolean;
  analysisJobId?: string;
  defaultDataset?: {
    name?: string;
    values?: Record<string, unknown>;
  };
}

export interface ControlPlaneExtractTestCaseInput {
  name?: string;
  versionLabel?: string;
  changeSummary?: string;
  publish?: boolean;
  defaultDatasetName?: string;
}

export interface ControlPlaneDeriveTestCaseResult {
  derivationMode: 'new_case' | 'new_version';
  testCase: ControlPlaneTestCaseRecord;
  version: ControlPlaneTestCaseVersionRecord;
  dataTemplateVersion: ControlPlaneDataTemplateVersionRecord;
  defaultDatasetRow: ControlPlaneDatasetRowRecord;
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

export interface ControlPlaneEnqueueCaseVersionRunInput {
  tenantId: string;
  projectId: string;
  name: string;
  mode?: string;
  testCaseVersionId: string;
  datasetRowId?: string;
  requiredCapabilities?: string[];
  variableContext?: Record<string, unknown>;
  traceId?: string;
  correlationId?: string;
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
  enqueueCaseVersionRun?(input: ControlPlaneEnqueueCaseVersionRunInput): Promise<ControlPlaneEnqueueWebRunResult>;
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
  resolvePrincipal?(actor: ControlPlaneAuthenticatedActor): Promise<ControlPlanePrincipal>;
  createRecording?(
    input: ControlPlaneCreateRecordingInput,
    actor: { subjectId: string },
  ): Promise<ControlPlaneRecordingRecord>;
  getRecording?(recordingId: string): Promise<ControlPlaneRecordingRecord | undefined>;
  appendRecordingEvents?(
    recordingId: string,
    events: ControlPlaneCreateRecordingEventInput[],
    actor: { subjectId: string },
  ): Promise<{ recording: ControlPlaneRecordingRecord; appendedCount: number } | undefined>;
  analyzeRecordingDsl?(
    recordingId: string,
    actor: { subjectId: string },
  ): Promise<ControlPlaneRecordingAnalysisJobRecord | undefined>;
  publishRecordingAsTestCase?(
    recordingId: string,
    input: ControlPlanePublishRecordingInput,
    actor: { subjectId: string },
  ): Promise<ControlPlaneCreateTestCaseResult | undefined>;
  extractTestCaseFromRunItem?(
    runItemId: string,
    input: ControlPlaneExtractTestCaseInput,
    actor: { subjectId: string },
  ): Promise<ControlPlaneDeriveTestCaseResult | undefined>;
  createTestCase?(
    input: ControlPlaneCreateTestCaseInput,
    actor: { subjectId: string },
  ): Promise<ControlPlaneCreateTestCaseResult>;
  listTestCases?(query: ControlPlaneListTestCasesQuery): Promise<ControlPlanePage<ControlPlaneTestCaseRecord>>;
  getTestCase?(testCaseId: string): Promise<ControlPlaneTestCaseRecord | undefined>;
  updateTestCase?(
    testCaseId: string,
    input: ControlPlaneUpdateTestCaseInput,
    actor: { subjectId: string },
  ): Promise<ControlPlaneTestCaseRecord | undefined>;
  archiveTestCase?(
    testCaseId: string,
    actor: { subjectId: string },
  ): Promise<ControlPlaneTestCaseRecord | undefined>;
  listTestCaseVersions?(query: ControlPlaneListTestCaseVersionsQuery): Promise<ControlPlanePage<ControlPlaneTestCaseVersionRecord>>;
  createTestCaseVersion?(
    testCaseId: string,
    input: ControlPlaneCreateTestCaseVersionInput,
    actor: { subjectId: string },
  ): Promise<ControlPlaneCreateTestCaseVersionResult | undefined>;
  getTestCaseVersion?(testCaseVersionId: string): Promise<ControlPlaneTestCaseVersionRecord | undefined>;
  publishTestCaseVersion?(
    testCaseVersionId: string,
    actor: { subjectId: string },
  ): Promise<ControlPlaneTestCaseVersionRecord | undefined>;
  getDataTemplateForCaseVersion?(testCaseVersionId: string): Promise<ControlPlaneDataTemplateVersionRecord | undefined>;
  listDatasetRows?(query: ControlPlaneListDatasetRowsQuery): Promise<ControlPlanePage<ControlPlaneDatasetRowRecord>>;
  getDatasetRow?(datasetRowId: string): Promise<ControlPlaneDatasetRowRecord | undefined>;
  createDatasetRow?(
    testCaseVersionId: string,
    input: ControlPlaneCreateDatasetRowInput,
    actor: { subjectId: string },
  ): Promise<ControlPlaneDatasetRowRecord | undefined>;
  updateDatasetRow?(
    datasetRowId: string,
    input: ControlPlaneUpdateDatasetRowInput,
    actor: { subjectId: string },
  ): Promise<ControlPlaneDatasetRowRecord | undefined>;
  archiveDatasetRow?(
    datasetRowId: string,
    actor: { subjectId: string },
  ): Promise<ControlPlaneDatasetRowRecord | undefined>;
  bindDefaultDatasetRow?(
    testCaseVersionId: string,
    datasetRowId: string,
    actor: { subjectId: string },
  ): Promise<ControlPlaneTestCaseVersionRecord | undefined>;
  recordRunnerEvent(envelope: RunnerResultEnvelope): Promise<RecordRunnerEventResult>;
  listJobEvents(jobId: string): Promise<RecordedRunnerEvent[]>;
  enqueueStepDecision(
    jobId: string,
    sourceStepId: string,
    decision: StepControlResponse,
    context?: { tenantId?: string; runId?: string; runItemId?: string },
  ): Promise<void>;
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
    context?: { tenantId?: string },
  ): Promise<StepControlResponse | undefined>;
  snapshot(): Promise<ControlPlaneStateSnapshot>;
  close?(): Promise<void>;
}

export interface StepResultRecord {
  payload: StepResultPayload;
  envelope: StepResultReportedEnvelope;
}

export type StepDecisionRequest = StepControlRequest;
