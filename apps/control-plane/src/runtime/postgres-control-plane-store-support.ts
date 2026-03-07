import type {
  ControlPlaneAgentRecord,
  ControlPlaneArtifactRecord,
  ControlPlaneCompleteLeaseInput,
  ControlPlaneDataTemplateVersionRecord,
  ControlPlaneDatasetRowRecord,
  ControlPlaneJobLeaseRecord,
  ControlPlanePage,
  ControlPlaneRecordingAnalysisJobRecord,
  ControlPlaneRecordingRecord,
  ControlPlaneRunItemRecord,
  ControlPlaneRunRecord,
  ControlPlaneStepEventRecord,
  ControlPlaneTestCaseRecord,
  ControlPlaneTestCaseVersionRecord,
  RunnerResultEnvelope,
} from '../types.js';
import type { ArtifactReference, CompiledStep, EnvProfile, LocatorDraft, WebStepPlanDraft } from '@aiwtp/web-dsl-schema';
import type {
  ResultReportedEnvelope,
  StepControlResponse,
  StepResultReportedEnvelope,
  WebWorkerJob,
} from '@aiwtp/web-worker';
import { normalizeCapabilities } from './job-capabilities.js';
import { encodeCursor } from './pagination.js';

export interface RunnerEventRow {
  job_id: string;
  event_id: string;
  envelope_json: RunnerResultEnvelope | string;
}

export interface StepDecisionRow {
  decision_id: string;
  action: StepControlResponse['action'];
  reason: string | null;
  replacement_step_json: CompiledStep | string | null;
  resume_after_ms: number | null;
}

export interface SnapshotDecisionRow {
  job_id: string;
  source_step_id: string;
  action: StepControlResponse['action'];
  reason: string | null;
  replacement_step_json: CompiledStep | string | null;
  resume_after_ms: number | null;
}

export interface RunProjectionRow {
  run_id: string;
  tenant_id: string;
  project_id: string;
  name: string | null;
  mode: string | null;
  selection_kind: string | null;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  last_event_id: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface RunItemProjectionRow {
  run_item_id: string;
  run_id: string;
  job_id: string;
  tenant_id: string;
  project_id: string;
  attempt_no: number;
  status: string;
  job_kind: string | null;
  required_capabilities_json: string[] | string;
  test_case_id: string | null;
  test_case_version_id: string | null;
  data_template_version_id: string | null;
  dataset_row_id: string | null;
  input_snapshot_json: Record<string, unknown> | string;
  source_recording_id: string | null;
  assigned_agent_id: string | null;
  lease_token: string | null;
  control_state: string | null;
  control_reason: string | null;
  started_at: string | null;
  finished_at: string | null;
  last_event_id: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface StepEventProjectionRow {
  event_id: string;
  run_id: string;
  run_item_id: string;
  job_id: string;
  tenant_id: string;
  project_id: string;
  attempt_no: number;
  compiled_step_id: string;
  source_step_id: string;
  status: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  error_code: string | null;
  error_message: string | null;
  artifacts_json: unknown[] | string;
  extracted_variables_json: unknown[] | string;
  received_at: string;
}

export interface QueuedRunItemRow {
  run_item_id: string;
  run_id: string;
  job_id: string;
  tenant_id: string;
  project_id: string;
  attempt_no: number;
  status: string;
  job_kind: string;
  required_capabilities_json: string[] | string;
  assigned_agent_id: string | null;
  lease_token: string | null;
  last_event_id: string;
  created_at: string;
  updated_at: string;
  job_payload_json: WebWorkerJob | string;
}

export interface DerivableRunItemRow {
  run_item_id: string;
  run_id: string;
  tenant_id: string;
  project_id: string;
  status: string;
  test_case_id: string | null;
  test_case_version_id: string | null;
  input_snapshot_json: Record<string, unknown> | string;
  source_recording_id: string | null;
  job_payload_json: WebWorkerJob | string;
}

export interface AgentRow {
  agent_id: string;
  tenant_id: string;
  project_id: string | null;
  name: string;
  platform: string;
  architecture: string;
  runtime_kind: string;
  status: string;
  capabilities_json: string[] | string;
  metadata_json: Record<string, unknown> | string;
  max_parallel_slots: number;
  last_heartbeat_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArtifactRow {
  artifact_id: string;
  tenant_id: string;
  project_id: string;
  run_id: string | null;
  run_item_id: string | null;
  step_event_id: string | null;
  job_id: string | null;
  artifact_type: string;
  storage_uri: string;
  content_type: string | null;
  size_bytes: number | null;
  sha256: string | null;
  metadata_json: Record<string, unknown> | string;
  retention_expires_at: string | null;
  created_at: string;
}

export interface LeaseRow {
  lease_id: number;
  job_id: string;
  run_id: string;
  run_item_id: string;
  agent_id: string;
  lease_token: string;
  attempt_no: number;
  status: string;
  acquired_at: string;
  expires_at: string;
  heartbeat_at: string | null;
  released_at: string | null;
}

export interface ExpiredLeaseRow {
  run_id: string | null;
  run_item_id: string | null;
}

export interface EntityLocatorRow {
  tenant_id: string;
  project_id: string | null;
  run_id?: string | null;
  run_item_id?: string | null;
  job_id?: string | null;
  agent_id?: string | null;
  recording_id?: string | null;
  test_case_id?: string | null;
  test_case_version_id?: string | null;
  data_template_id?: string | null;
  data_template_version_id?: string | null;
  dataset_row_id?: string | null;
}

export interface TenantSchemaRow {
  tenant_id: string;
  schema_name: string;
}

export interface TestCaseRow {
  test_case_id: string;
  tenant_id: string;
  project_id: string;
  data_template_id: string;
  name: string;
  status: string;
  latest_version_id: string | null;
  latest_published_version_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TestCaseVersionRow {
  test_case_version_id: string;
  test_case_id: string;
  tenant_id: string;
  project_id: string;
  version_no: number;
  version_label: string | null;
  status: string;
  plan_json: WebStepPlanDraft | string;
  env_profile_json: EnvProfile | string;
  data_template_id: string;
  data_template_version_id: string;
  default_dataset_row_id: string | null;
  source_recording_id: string | null;
  source_run_id: string | null;
  derived_from_case_version_id: string | null;
  change_summary: string | null;
  created_by: string | null;
  created_at: string;
}

export interface RecordingRow {
  recording_id: string;
  tenant_id: string;
  project_id: string;
  name: string;
  status: string;
  source_type: ControlPlaneRecordingRecord['sourceType'];
  env_profile_json: EnvProfile | string;
  started_at: string;
  finished_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecordingEventRow {
  recording_event_id: string;
  recording_id: string;
  seq_no: number;
  event_type: string;
  page_url: string | null;
  locator_json: Record<string, unknown> | string | null;
  payload_json: Record<string, unknown> | string;
  captured_at: string;
}

export interface RecordingAnalysisJobRow {
  recording_analysis_job_id: string;
  recording_id: string;
  tenant_id: string;
  project_id: string;
  status: string;
  dsl_plan_json: WebStepPlanDraft | string | null;
  structured_plan_json: Record<string, unknown> | string;
  data_template_draft_json: ControlPlaneRecordingAnalysisJobRecord['dataTemplateDraft'] | string;
  started_at: string;
  finished_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DataTemplateVersionRow {
  data_template_id: string;
  data_template_version_id: string;
  test_case_id: string;
  tenant_id: string;
  project_id: string;
  version_no: number;
  schema_json: ControlPlaneDataTemplateVersionRecord['schema'] | string;
  validation_rules_json: Record<string, unknown> | string;
  default_dataset_row_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DatasetRow {
  dataset_row_id: string;
  test_case_id: string;
  data_template_version_id: string;
  tenant_id: string;
  project_id: string;
  name: string;
  status: string;
  values_json: Record<string, unknown> | string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubjectProjectMembershipRow {
  tenant_id: string;
  subject_id: string;
  project_id: string;
  roles_json: string[] | string;
}

const isObjectRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isLocatorDraftRecord = (value: unknown): value is LocatorDraft =>
  isObjectRecord(value)
  && typeof value.strategy === 'string'
  && typeof value.value === 'string';

export const isArtifactReference = (value: unknown): value is ArtifactReference =>
  typeof value === 'object'
  && value !== null
  && typeof (value as ArtifactReference).kind === 'string'
  && typeof (value as ArtifactReference).uri === 'string';

export const isStepResultEnvelope = (envelope: RunnerResultEnvelope): envelope is StepResultReportedEnvelope =>
  envelope.event_type === 'step.result_reported';

export const isJobResultEnvelope = (envelope: RunnerResultEnvelope): envelope is ResultReportedEnvelope =>
  envelope.event_type === 'job.result_reported';

export const parseJsonColumn = <T>(value: T | string | null): T | null => {
  if (value == null) {
    return null;
  }

  return typeof value === 'string' ? JSON.parse(value) as T : value;
};

export const parseLocatorColumn = (value: Record<string, unknown> | string | null): LocatorDraft | null => {
  const parsed = parseJsonColumn<Record<string, unknown>>(value);
  return isLocatorDraftRecord(parsed) ? parsed : null;
};

export const resolveArtifactRetentionExpiresAt = (artifact: ArtifactReference): string | null => {
  if (typeof artifact.retentionExpiresAt === 'string' && artifact.retentionExpiresAt.length > 0) {
    return artifact.retentionExpiresAt;
  }

  if (isObjectRecord(artifact.metadata) && typeof artifact.metadata.retention_expires_at === 'string') {
    return artifact.metadata.retention_expires_at;
  }

  return null;
};

export const buildStepDecision = (row: StepDecisionRow | SnapshotDecisionRow): StepControlResponse => ({
  action: row.action,
  reason: row.reason ?? undefined,
  replacement_step: parseJsonColumn<CompiledStep>(row.replacement_step_json) ?? undefined,
  resume_after_ms: row.resume_after_ms ?? undefined,
});

export const toRunnerEventFields = (envelope: RunnerResultEnvelope) => ({
  eventId: envelope.event_id,
  eventType: envelope.event_type,
  tenantId: envelope.tenant_id,
  projectId: envelope.project_id,
  traceId: envelope.trace_id,
  correlationId: envelope.correlation_id ?? null,
  jobId: envelope.payload.job_id,
  runId: envelope.payload.run_id,
  runItemId: envelope.payload.run_item_id,
  attemptNo: envelope.payload.attempt_no,
  sourceStepId: isStepResultEnvelope(envelope) ? envelope.payload.source_step_id : null,
  status: envelope.payload.status,
  envelopeJson: JSON.stringify(envelope),
});

export const toProjectionStatus = (envelope: RunnerResultEnvelope): string => {
  if (isJobResultEnvelope(envelope)) {
    return envelope.payload.status;
  }
  return 'running';
};

export const toProjectionTimestamps = (envelope: RunnerResultEnvelope): { startedAt: string | null; finishedAt: string | null } => {
  if (isJobResultEnvelope(envelope)) {
    return {
      startedAt: envelope.payload.started_at ?? null,
      finishedAt: envelope.payload.finished_at ?? null,
    };
  }

  return {
    startedAt: envelope.payload.started_at,
    finishedAt: null,
  };
};

export const buildStepEventValues = (envelope: StepResultReportedEnvelope) => ({
  eventId: envelope.event_id,
  tenantId: envelope.tenant_id,
  projectId: envelope.project_id,
  jobId: envelope.payload.job_id,
  runId: envelope.payload.run_id,
  runItemId: envelope.payload.run_item_id,
  attemptNo: envelope.payload.attempt_no,
  compiledStepId: envelope.payload.compiled_step_id,
  sourceStepId: envelope.payload.source_step_id,
  status: envelope.payload.status,
  startedAt: envelope.payload.started_at,
  finishedAt: envelope.payload.finished_at,
  durationMs: envelope.payload.duration_ms,
  errorCode: envelope.payload.error?.code ?? null,
  errorMessage: envelope.payload.error?.message ?? null,
  artifactsJson: JSON.stringify(envelope.payload.artifacts ?? []),
  extractedVariablesJson: JSON.stringify(envelope.payload.extracted_variables ?? []),
  envelopeJson: JSON.stringify(envelope),
});

export const upsertProjectionStatusSql = (tableName: string, keyField: 'run_id' | 'run_item_id') => `
  insert into ${tableName} (
    ${keyField},
    tenant_id,
    project_id,
    status,
    started_at,
    finished_at,
    last_event_id
  ) values ($1, $2, $3, $4, $5, $6, $7)
  on conflict (${keyField}) do update set
    tenant_id = excluded.tenant_id,
    project_id = excluded.project_id,
    status = case
      when excluded.status = 'running' and ${tableName}.status in ('passed', 'failed', 'canceled') then ${tableName}.status
      else excluded.status
    end,
    started_at = coalesce(${tableName}.started_at, excluded.started_at),
    finished_at = coalesce(excluded.finished_at, ${tableName}.finished_at),
    last_event_id = excluded.last_event_id,
    updated_at = now()
`;

export const mapRunProjection = (row: RunProjectionRow): ControlPlaneRunRecord => ({
  runId: row.run_id,
  tenantId: row.tenant_id,
  projectId: row.project_id,
  name: row.name,
  mode: row.mode,
  selectionKind: row.selection_kind,
  status: row.status,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  lastEventId: row.last_event_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapRunItemProjection = (row: RunItemProjectionRow): ControlPlaneRunItemRecord => ({
  runItemId: row.run_item_id,
  runId: row.run_id,
  jobId: row.job_id,
  tenantId: row.tenant_id,
  projectId: row.project_id,
  attemptNo: row.attempt_no,
  status: row.status,
  jobKind: row.job_kind,
  requiredCapabilities: parseJsonColumn<string[]>(row.required_capabilities_json) ?? [],
  testCaseId: row.test_case_id,
  testCaseVersionId: row.test_case_version_id,
  dataTemplateVersionId: row.data_template_version_id,
  datasetRowId: row.dataset_row_id,
  inputSnapshot: parseJsonColumn<Record<string, unknown>>(row.input_snapshot_json) ?? {},
  sourceRecordingId: row.source_recording_id,
  assignedAgentId: row.assigned_agent_id,
  leaseToken: row.lease_token,
  controlState: row.control_state,
  controlReason: row.control_reason,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  lastEventId: row.last_event_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapStepEventProjection = (row: StepEventProjectionRow): ControlPlaneStepEventRecord => ({
  eventId: row.event_id,
  runId: row.run_id,
  runItemId: row.run_item_id,
  jobId: row.job_id,
  tenantId: row.tenant_id,
  projectId: row.project_id,
  attemptNo: row.attempt_no,
  compiledStepId: row.compiled_step_id,
  sourceStepId: row.source_step_id,
  status: row.status,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  durationMs: row.duration_ms,
  errorCode: row.error_code,
  errorMessage: row.error_message,
  artifacts: parseJsonColumn<unknown[]>(row.artifacts_json) ?? [],
  extractedVariables: parseJsonColumn<unknown[]>(row.extracted_variables_json) ?? [],
  receivedAt: row.received_at,
});

export const mapTestCase = (row: TestCaseRow): ControlPlaneTestCaseRecord => ({
  testCaseId: row.test_case_id,
  tenantId: row.tenant_id,
  projectId: row.project_id,
  dataTemplateId: row.data_template_id,
  name: row.name,
  status: row.status,
  latestVersionId: row.latest_version_id,
  latestPublishedVersionId: row.latest_published_version_id,
  createdBy: row.created_by,
  updatedBy: row.updated_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapTestCaseVersion = (row: TestCaseVersionRow): ControlPlaneTestCaseVersionRecord => ({
  testCaseVersionId: row.test_case_version_id,
  testCaseId: row.test_case_id,
  tenantId: row.tenant_id,
  projectId: row.project_id,
  versionNo: row.version_no,
  versionLabel: row.version_label,
  status: row.status,
  plan: parseJsonColumn<WebStepPlanDraft>(row.plan_json) as WebStepPlanDraft,
  envProfile: parseJsonColumn<EnvProfile>(row.env_profile_json) as EnvProfile,
  dataTemplateId: row.data_template_id,
  dataTemplateVersionId: row.data_template_version_id,
  defaultDatasetRowId: row.default_dataset_row_id,
  sourceRecordingId: row.source_recording_id,
  sourceRunId: row.source_run_id,
  derivedFromCaseVersionId: row.derived_from_case_version_id,
  changeSummary: row.change_summary,
  createdBy: row.created_by,
  createdAt: row.created_at,
});

export const mapRecording = (row: RecordingRow): ControlPlaneRecordingRecord => ({
  recordingId: row.recording_id,
  tenantId: row.tenant_id,
  projectId: row.project_id,
  name: row.name,
  status: row.status,
  sourceType: row.source_type,
  envProfile: parseJsonColumn<EnvProfile>(row.env_profile_json) as EnvProfile,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapRecordingAnalysisJob = (row: RecordingAnalysisJobRow): ControlPlaneRecordingAnalysisJobRecord => ({
  recordingAnalysisJobId: row.recording_analysis_job_id,
  recordingId: row.recording_id,
  tenantId: row.tenant_id,
  projectId: row.project_id,
  status: row.status,
  dslPlan: parseJsonColumn<WebStepPlanDraft>(row.dsl_plan_json),
  structuredPlan: parseJsonColumn<Record<string, unknown>>(row.structured_plan_json) ?? {},
  dataTemplateDraft: parseJsonColumn<ControlPlaneRecordingAnalysisJobRecord['dataTemplateDraft']>(row.data_template_draft_json) ?? { fields: [] },
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  createdBy: row.created_by,
  createdAt: row.created_at,
});

export const mapDataTemplateVersion = (row: DataTemplateVersionRow): ControlPlaneDataTemplateVersionRecord => ({
  dataTemplateId: row.data_template_id,
  dataTemplateVersionId: row.data_template_version_id,
  testCaseId: row.test_case_id,
  tenantId: row.tenant_id,
  projectId: row.project_id,
  versionNo: row.version_no,
  schema: parseJsonColumn<ControlPlaneDataTemplateVersionRecord['schema']>(row.schema_json) ?? { fields: [] },
  validationRules: parseJsonColumn<Record<string, unknown>>(row.validation_rules_json) ?? {},
  defaultDatasetRowId: row.default_dataset_row_id,
  createdBy: row.created_by,
  createdAt: row.created_at,
});

export const mapDatasetRow = (row: DatasetRow): ControlPlaneDatasetRowRecord => ({
  datasetRowId: row.dataset_row_id,
  testCaseId: row.test_case_id,
  dataTemplateVersionId: row.data_template_version_id,
  tenantId: row.tenant_id,
  projectId: row.project_id,
  name: row.name,
  status: row.status,
  values: parseJsonColumn<Record<string, unknown>>(row.values_json) ?? {},
  createdBy: row.created_by,
  updatedBy: row.updated_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapAgent = (row: AgentRow): ControlPlaneAgentRecord => ({
  agentId: row.agent_id,
  tenantId: row.tenant_id,
  projectId: row.project_id,
  name: row.name,
  platform: row.platform,
  architecture: row.architecture,
  runtimeKind: row.runtime_kind,
  status: row.status,
  capabilities: normalizeCapabilities(parseJsonColumn<string[]>(row.capabilities_json) ?? []),
  metadata: parseJsonColumn<Record<string, unknown>>(row.metadata_json) ?? {},
  maxParallelSlots: row.max_parallel_slots,
  lastHeartbeatAt: row.last_heartbeat_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapArtifact = (row: ArtifactRow): ControlPlaneArtifactRecord => ({
  artifactId: row.artifact_id,
  tenantId: row.tenant_id,
  projectId: row.project_id,
  runId: row.run_id,
  runItemId: row.run_item_id,
  stepEventId: row.step_event_id,
  jobId: row.job_id,
  artifactType: row.artifact_type,
  storageUri: row.storage_uri,
  contentType: row.content_type,
  sizeBytes: row.size_bytes,
  sha256: row.sha256,
  metadata: parseJsonColumn<Record<string, unknown>>(row.metadata_json) ?? {},
  retentionExpiresAt: row.retention_expires_at,
  createdAt: row.created_at,
});

export const mapLease = (row: LeaseRow): ControlPlaneJobLeaseRecord => ({
  leaseId: row.lease_id,
  leaseToken: row.lease_token,
  jobId: row.job_id,
  runId: row.run_id,
  runItemId: row.run_item_id,
  agentId: row.agent_id,
  attemptNo: row.attempt_no,
  status: row.status,
  acquiredAt: row.acquired_at,
  expiresAt: row.expires_at,
  heartbeatAt: row.heartbeat_at,
  releasedAt: row.released_at,
});

export const toPage = <T>(items: T[], limit: number, getCursor: (item: T) => { primary: string; secondary: string }): ControlPlanePage<T> => {
  const visibleItems = items.slice(0, limit);
  const nextCursor = items.length > limit && visibleItems.length > 0
    ? encodeCursor(getCursor(visibleItems[visibleItems.length - 1]))
    : undefined;

  return {
    items: visibleItems,
    nextCursor,
  };
};

export const mapCompletionToProjectionStatus = (status: ControlPlaneCompleteLeaseInput['status']): 'passed' | 'failed' | 'canceled' => {
  switch (status) {
    case 'succeeded':
      return 'passed';
    case 'failed':
      return 'failed';
    case 'canceled':
      return 'canceled';
  }
};
