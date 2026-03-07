import type {
  ControlPlaneAgentRecord,
  ControlPlaneArtifactRecord,
  ControlPlaneDataTemplateVersionRecord,
  ControlPlaneDatasetRowRecord,
  ControlPlaneDeriveTestCaseResult,
  ControlPlaneJobLeaseRecord,
  ControlPlanePage,
  ControlPlanePrincipal,
  ControlPlaneRecordingAnalysisJobRecord,
  ControlPlaneRecordingRecord,
  ControlPlaneRunItemRecord,
  ControlPlaneRunRecord,
  ControlPlaneStepEventRecord,
  ControlPlaneTestCaseRecord,
  ControlPlaneTestCaseVersionRecord,
} from '../types.js';

const toApiRunStatus = (status: string): string => {
  switch (status) {
    case 'created':
      return 'created';
    case 'queued':
      return 'queued';
    case 'passed':
      return 'succeeded';
    case 'failed':
      return 'failed';
    case 'canceling':
      return 'canceling';
    case 'canceled':
      return 'canceled';
    default:
      return 'running';
  }
};

const toApiRunItemStatus = (status: string): string => {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'dispatched':
      return 'dispatched';
    case 'passed':
      return 'passed';
    case 'failed':
      return 'failed';
    case 'canceled':
      return 'canceled';
    default:
      return 'running';
  }
};

const toApiTemplateSchema = (schema: ControlPlaneDataTemplateVersionRecord['schema']) => ({
  fields: schema.fields.map((field) => ({
    key: field.key,
    source_type: field.sourceType,
    value_type: field.valueType,
    required: field.required,
  })),
});

export const toApiRun = (run: ControlPlaneRunRecord) => ({
  id: run.runId,
  tenant_id: run.tenantId,
  project_id: run.projectId,
  name: run.name ?? undefined,
  status: toApiRunStatus(run.status),
  created_at: run.createdAt ?? run.startedAt ?? run.updatedAt ?? new Date().toISOString(),
  updated_at: run.updatedAt ?? run.createdAt ?? run.startedAt ?? new Date().toISOString(),
  summary: {
    last_event_id: run.lastEventId,
    started_at: run.startedAt,
    finished_at: run.finishedAt,
    mode: run.mode ?? undefined,
    selection_kind: run.selectionKind ?? undefined,
  },
});

export const toApiRunItem = (runItem: ControlPlaneRunItemRecord) => ({
  id: runItem.runItemId,
  run_id: runItem.runId,
  tenant_id: runItem.tenantId,
  project_id: runItem.projectId,
  status: toApiRunItemStatus(runItem.status),
  attempt_no: runItem.attemptNo,
  artifacts: [],
  summary: {
    job_id: runItem.jobId,
    job_kind: runItem.jobKind ?? undefined,
    required_capabilities: runItem.requiredCapabilities ?? undefined,
    test_case_id: runItem.testCaseId ?? undefined,
    test_case_version_id: runItem.testCaseVersionId ?? undefined,
    data_template_version_id: runItem.dataTemplateVersionId ?? undefined,
    dataset_row_id: runItem.datasetRowId ?? undefined,
    input_snapshot: runItem.inputSnapshot ?? undefined,
    source_recording_id: runItem.sourceRecordingId ?? undefined,
    assigned_agent_id: runItem.assignedAgentId ?? undefined,
    lease_token: runItem.leaseToken ?? undefined,
    control_state: runItem.controlState ?? undefined,
    control_reason: runItem.controlReason ?? undefined,
  },
});

export const toApiStepEvent = (stepEvent: ControlPlaneStepEventRecord) => ({
  event_id: stepEvent.eventId,
  run_id: stepEvent.runId,
  run_item_id: stepEvent.runItemId,
  job_id: stepEvent.jobId,
  tenant_id: stepEvent.tenantId,
  project_id: stepEvent.projectId,
  attempt_no: stepEvent.attemptNo,
  compiled_step_id: stepEvent.compiledStepId,
  source_step_id: stepEvent.sourceStepId,
  status: stepEvent.status,
  started_at: stepEvent.startedAt,
  finished_at: stepEvent.finishedAt,
  duration_ms: stepEvent.durationMs,
  error_code: stepEvent.errorCode,
  error_message: stepEvent.errorMessage,
  artifacts: stepEvent.artifacts,
  extracted_variables: stepEvent.extractedVariables,
  received_at: stepEvent.receivedAt,
});

export const toApiAgent = (agent: ControlPlaneAgentRecord) => ({
  agent_id: agent.agentId,
  tenant_id: agent.tenantId,
  project_id: agent.projectId,
  name: agent.name,
  platform: agent.platform,
  architecture: agent.architecture,
  runtime_kind: agent.runtimeKind,
  status: agent.status,
  capabilities: agent.capabilities,
  metadata: agent.metadata,
  max_parallel_slots: agent.maxParallelSlots,
  last_heartbeat_at: agent.lastHeartbeatAt,
  created_at: agent.createdAt,
  updated_at: agent.updatedAt,
});

export const toApiArtifact = (artifact: ControlPlaneArtifactRecord) => ({
  artifact_id: artifact.artifactId,
  tenant_id: artifact.tenantId,
  project_id: artifact.projectId,
  run_id: artifact.runId,
  run_item_id: artifact.runItemId,
  step_event_id: artifact.stepEventId,
  job_id: artifact.jobId,
  artifact_type: artifact.artifactType,
  storage_uri: artifact.storageUri,
  content_type: artifact.contentType,
  size_bytes: artifact.sizeBytes,
  sha256: artifact.sha256,
  metadata: artifact.metadata,
  retention_expires_at: artifact.retentionExpiresAt,
  created_at: artifact.createdAt,
});

export const toApiPrincipal = (principal: ControlPlanePrincipal) => ({
  subject_id: principal.subjectId,
  tenant_id: principal.tenantId,
  project_ids: principal.projectIds,
  roles: principal.roles,
});

export const toApiTestCase = (testCase: ControlPlaneTestCaseRecord) => ({
  id: testCase.testCaseId,
  tenant_id: testCase.tenantId,
  project_id: testCase.projectId,
  data_template_id: testCase.dataTemplateId,
  name: testCase.name,
  status: testCase.status,
  latest_version_id: testCase.latestVersionId,
  latest_published_version_id: testCase.latestPublishedVersionId,
  created_by: testCase.createdBy,
  updated_by: testCase.updatedBy,
  created_at: testCase.createdAt,
  updated_at: testCase.updatedAt,
});

export const toApiTestCaseVersion = (version: ControlPlaneTestCaseVersionRecord) => ({
  id: version.testCaseVersionId,
  test_case_id: version.testCaseId,
  tenant_id: version.tenantId,
  project_id: version.projectId,
  version_no: version.versionNo,
  version_label: version.versionLabel,
  status: version.status,
  plan: version.plan,
  env_profile: version.envProfile,
  data_template_id: version.dataTemplateId,
  data_template_version_id: version.dataTemplateVersionId,
  default_dataset_row_id: version.defaultDatasetRowId,
  source_recording_id: version.sourceRecordingId,
  source_run_id: version.sourceRunId,
  derived_from_case_version_id: version.derivedFromCaseVersionId,
  change_summary: version.changeSummary,
  created_by: version.createdBy,
  created_at: version.createdAt,
});

export const toApiDataTemplateVersion = (template: ControlPlaneDataTemplateVersionRecord) => ({
  data_template_id: template.dataTemplateId,
  data_template_version_id: template.dataTemplateVersionId,
  test_case_id: template.testCaseId,
  tenant_id: template.tenantId,
  project_id: template.projectId,
  version_no: template.versionNo,
  schema: toApiTemplateSchema(template.schema),
  validation_rules: template.validationRules,
  default_dataset_row_id: template.defaultDatasetRowId,
  created_by: template.createdBy,
  created_at: template.createdAt,
});

export const toApiDatasetRow = (datasetRow: ControlPlaneDatasetRowRecord) => ({
  id: datasetRow.datasetRowId,
  test_case_id: datasetRow.testCaseId,
  data_template_version_id: datasetRow.dataTemplateVersionId,
  tenant_id: datasetRow.tenantId,
  project_id: datasetRow.projectId,
  name: datasetRow.name,
  status: datasetRow.status,
  values: datasetRow.values,
  created_by: datasetRow.createdBy,
  updated_by: datasetRow.updatedBy,
  created_at: datasetRow.createdAt,
  updated_at: datasetRow.updatedAt,
});

export const toApiTestCaseBundle = (
  testCase: ControlPlaneTestCaseRecord,
  version: ControlPlaneTestCaseVersionRecord,
  dataTemplateVersion: ControlPlaneDataTemplateVersionRecord,
  defaultDatasetRow: ControlPlaneDatasetRowRecord,
) => ({
  test_case: toApiTestCase(testCase),
  version: toApiTestCaseVersion(version),
  data_template: toApiDataTemplateVersion(dataTemplateVersion),
  default_dataset_row: toApiDatasetRow(defaultDatasetRow),
});

export const toApiRecording = (recording: ControlPlaneRecordingRecord) => ({
  id: recording.recordingId,
  tenant_id: recording.tenantId,
  project_id: recording.projectId,
  name: recording.name,
  status: recording.status,
  source_type: recording.sourceType,
  env_profile: recording.envProfile,
  started_at: recording.startedAt,
  finished_at: recording.finishedAt,
  created_by: recording.createdBy,
  created_at: recording.createdAt,
  updated_at: recording.updatedAt,
});

export const toApiRecordingAnalysisJob = (analysisJob: ControlPlaneRecordingAnalysisJobRecord) => ({
  id: analysisJob.recordingAnalysisJobId,
  recording_id: analysisJob.recordingId,
  tenant_id: analysisJob.tenantId,
  project_id: analysisJob.projectId,
  status: analysisJob.status,
  dsl_plan: analysisJob.dslPlan,
  structured_plan: analysisJob.structuredPlan,
  data_template_draft: toApiTemplateSchema(analysisJob.dataTemplateDraft),
  started_at: analysisJob.startedAt,
  finished_at: analysisJob.finishedAt,
  created_by: analysisJob.createdBy,
  created_at: analysisJob.createdAt,
});

export const toApiDerivedTestCaseBundle = (derived: ControlPlaneDeriveTestCaseResult) => ({
  derivation_mode: derived.derivationMode,
  test_case: toApiTestCase(derived.testCase),
  version: toApiTestCaseVersion(derived.version),
  data_template: toApiDataTemplateVersion(derived.dataTemplateVersion),
  default_dataset_row: toApiDatasetRow(derived.defaultDatasetRow),
});

export const toApiLease = (lease: ControlPlaneJobLeaseRecord) => ({
  lease_id: lease.leaseId,
  lease_token: lease.leaseToken,
  job_id: lease.jobId,
  run_id: lease.runId,
  run_item_id: lease.runItemId,
  agent_id: lease.agentId,
  attempt_no: lease.attemptNo,
  status: lease.status,
  acquired_at: lease.acquiredAt,
  expires_at: lease.expiresAt,
  heartbeat_at: lease.heartbeatAt,
  released_at: lease.releasedAt,
});

export const toPaginatedPayload = <T>(page: ControlPlanePage<T>, mapper: (item: T) => unknown) => ({
  items: page.items.map(mapper),
  next_cursor: page.nextCursor,
});
