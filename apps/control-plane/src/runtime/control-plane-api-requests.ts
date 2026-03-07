import type { IncomingMessage } from 'node:http';

import type {
  ControlPlaneAcquireLeaseInput,
  ControlPlaneCompleteLeaseInput,
  ControlPlaneCreateDatasetRowInput,
  ControlPlaneCreateRecordingEventInput,
  ControlPlaneCreateRecordingInput,
  ControlPlaneCreateTestCaseInput,
  ControlPlaneCreateTestCaseVersionInput,
  ControlPlaneEnqueueWebRunInput,
  ControlPlaneExtractTestCaseInput,
  ControlPlaneHeartbeatAgentInput,
  ControlPlaneHeartbeatLeaseInput,
  ControlPlanePublishRecordingInput,
  ControlPlaneRegisterAgentInput,
  ControlPlaneUpdateDatasetRowInput,
  ControlPlaneUpdateTestCaseInput,
  RunnerResultEnvelope,
  StepOverrideRequest,
} from '../types.js';
import type { StepControlRequest, StepControlResponse } from '@aiwtp/web-worker';
import type { ArtifactDownloadMode } from './artifact-blob-store.js';

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);
const isPositiveInteger = (value: unknown): value is number => Number.isInteger(value) && Number(value) > 0;
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isRunMode = (value: unknown): value is 'standard' | 'intelligent' =>
  value === 'standard' || value === 'intelligent';
const isLocatorDraftShape = (value: unknown): value is { strategy: string; value: string } =>
  isObject(value)
  && isString(value.strategy)
  && isString(value.value);

const isDatasetPayload = (value: unknown): value is Record<string, unknown> =>
  isObject(value)
  && ((value.name === undefined) || isString(value.name))
  && ((value.values === undefined) || isObject(value.values));

const isInlineWebRunSelection = (value: unknown): value is Record<string, unknown> =>
  isObject(value)
  && value.kind === 'inline_web_plan'
  && isObject(value.plan)
  && isObject(value.envProfile ?? value.env_profile);

const isCaseVersionRunSelection = (value: unknown): value is Record<string, unknown> =>
  isObject(value)
  && value.kind === 'case_version'
  && isString(value.testCaseVersionId ?? value.test_case_version_id)
  && ((value.datasetRowId === undefined && value.dataset_row_id === undefined)
    || isString(value.datasetRowId ?? value.dataset_row_id));

const isRecordingSourceType = (value: unknown): value is 'manual' | 'auto_explore' | 'run_replay' =>
  value === 'manual' || value === 'auto_explore' || value === 'run_replay';

const isRecordingEventItemRequest = (value: unknown): value is Record<string, unknown> =>
  isObject(value)
  && isString(value.event_type)
  && ((value.page_url === undefined) || isString(value.page_url))
  && ((value.locator === undefined) || isLocatorDraftShape(value.locator))
  && ((value.payload === undefined) || isObject(value.payload))
  && ((value.captured_at === undefined) || isString(value.captured_at));

export const readJson = async <T>(request: IncomingMessage): Promise<T> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {} as T;
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
};

export const isRunnerResultEnvelope = (value: unknown): value is RunnerResultEnvelope =>
  isObject(value) && typeof value.event_type === 'string' && isObject(value.payload) && typeof value.payload.job_id === 'string';

export const isStepControlRequest = (value: unknown): value is StepControlRequest =>
  isObject(value)
  && typeof value.job_id === 'string'
  && typeof value.source_step_id === 'string'
  && typeof value.compiled_step_id === 'string'
  && isObject(value.compiled_step);

export const isStepOverrideRequest = (value: unknown): value is StepOverrideRequest =>
  isObject(value)
  && typeof value.action === 'string';

export const isArtifactDownloadMode = (value: string): value is ArtifactDownloadMode =>
  value === 'redirect' || value === 'stream';

export const isRunCreateRequest = (value: unknown): value is Record<string, unknown> =>
  isObject(value)
  && isString(value.tenant_id)
  && isString(value.project_id)
  && isString(value.name)
  && isRunMode(value.mode)
  && (isInlineWebRunSelection(value.selection) || isCaseVersionRunSelection(value.selection))
  && ((value.execution_policy === undefined) || isObject(value.execution_policy));

export const isEnqueueWebRunRequest = (value: unknown): value is ControlPlaneEnqueueWebRunInput =>
  isObject(value)
  && isString(value.tenantId ?? value.tenant_id)
  && isString(value.projectId ?? value.project_id)
  && isString(value.name)
  && isObject(value.plan)
  && isObject(value.envProfile ?? value.env_profile)
  && ((value.requiredCapabilities === undefined && value.required_capabilities === undefined)
    || isStringArray(value.requiredCapabilities ?? value.required_capabilities))
  && (value.variableContext === undefined || value.variable_context === undefined || isObject(value.variableContext ?? value.variable_context));

export const isRegisterAgentRequest = (value: unknown): value is ControlPlaneRegisterAgentInput =>
  isObject(value)
  && isString(value.agentId ?? value.agent_id)
  && isString(value.tenantId ?? value.tenant_id)
  && isString(value.name)
  && isString(value.platform)
  && isString(value.architecture)
  && isString(value.runtimeKind ?? value.runtime_kind)
  && isStringArray(value.capabilities)
  && (value.maxParallelSlots === undefined || value.max_parallel_slots === undefined || isPositiveInteger(value.maxParallelSlots ?? value.max_parallel_slots))
  && (value.projectId === undefined || value.project_id === undefined || typeof (value.projectId ?? value.project_id) === 'string');

export const isHeartbeatAgentRequest = (value: unknown): value is ControlPlaneHeartbeatAgentInput =>
  isObject(value)
  && (value.status === undefined || isString(value.status))
  && (value.capabilities === undefined || isStringArray(value.capabilities))
  && (value.metadata === undefined || isObject(value.metadata))
  && (value.maxParallelSlots === undefined || value.max_parallel_slots === undefined || isPositiveInteger(value.maxParallelSlots ?? value.max_parallel_slots));

export const isAcquireLeaseRequest = (value: unknown): value is ControlPlaneAcquireLeaseInput =>
  isObject(value)
  && isStringArray(value.supported_job_kinds ?? value.supportedJobKinds)
  && Number.isInteger(value.lease_ttl_seconds ?? value.leaseTtlSeconds)
  && Number(value.lease_ttl_seconds ?? value.leaseTtlSeconds) > 0;

export const isHeartbeatLeaseRequest = (value: unknown): value is ControlPlaneHeartbeatLeaseInput =>
  isObject(value)
  && Number.isInteger(value.lease_ttl_seconds ?? value.leaseTtlSeconds)
  && Number(value.lease_ttl_seconds ?? value.leaseTtlSeconds) > 0;

export const isCompleteLeaseRequest = (value: unknown): value is ControlPlaneCompleteLeaseInput =>
  isObject(value)
  && ['succeeded', 'failed', 'canceled'].includes(String(value.status));

export const normalizeEnqueueWebRun = (value: Record<string, unknown>): ControlPlaneEnqueueWebRunInput => ({
  tenantId: String(value.tenantId ?? value.tenant_id),
  projectId: String(value.projectId ?? value.project_id),
  name: String(value.name),
  mode: typeof value.mode === 'string' ? value.mode : undefined,
  plan: value.plan as ControlPlaneEnqueueWebRunInput['plan'],
  envProfile: (value.envProfile ?? value.env_profile) as ControlPlaneEnqueueWebRunInput['envProfile'],
  requiredCapabilities: isStringArray(value.requiredCapabilities ?? value.required_capabilities)
    ? [...(value.requiredCapabilities ?? value.required_capabilities) as string[]]
    : undefined,
  variableContext: (value.variableContext ?? value.variable_context) as Record<string, unknown> | undefined,
  traceId: typeof value.traceId === 'string' ? value.traceId : typeof value.trace_id === 'string' ? value.trace_id : undefined,
  correlationId: typeof value.correlationId === 'string' ? value.correlationId : typeof value.correlation_id === 'string' ? value.correlation_id : undefined,
});

export const normalizeRunExecutionPolicy = (value: Record<string, unknown>) => {
  const executionPolicy = isObject(value.execution_policy) ? value.execution_policy : {};
  return {
    tenantId: String(value.tenant_id),
    projectId: String(value.project_id),
    name: String(value.name),
    mode: String(value.mode),
    requiredCapabilities: isStringArray(executionPolicy.requiredCapabilities ?? executionPolicy.required_capabilities)
      ? [...(executionPolicy.requiredCapabilities ?? executionPolicy.required_capabilities) as string[]]
      : undefined,
    variableContext: isObject(executionPolicy.variableContext ?? executionPolicy.variable_context)
      ? (executionPolicy.variableContext ?? executionPolicy.variable_context) as Record<string, unknown>
      : undefined,
    traceId: typeof executionPolicy.traceId === 'string'
      ? executionPolicy.traceId
      : typeof executionPolicy.trace_id === 'string'
        ? executionPolicy.trace_id
        : undefined,
    correlationId: typeof executionPolicy.correlationId === 'string'
      ? executionPolicy.correlationId
      : typeof executionPolicy.correlation_id === 'string'
        ? executionPolicy.correlation_id
        : undefined,
  };
};

export const isTestCaseCreateRequest = (value: unknown): value is Record<string, unknown> =>
  isObject(value)
  && isString(value.tenant_id)
  && isString(value.project_id)
  && isString(value.name)
  && isObject(value.plan)
  && isObject(value.env_profile)
  && ((value.version_label === undefined) || isString(value.version_label))
  && ((value.change_summary === undefined) || isString(value.change_summary))
  && ((value.publish === undefined) || isBoolean(value.publish))
  && ((value.default_dataset === undefined) || isDatasetPayload(value.default_dataset));

export const isTestCasePatchRequest = (value: unknown): value is Record<string, unknown> =>
  isObject(value)
  && ((value.name === undefined) || isString(value.name))
  && ((value.status === undefined) || ['draft', 'active', 'archived'].includes(String(value.status)));

export const isTestCaseVersionCreateRequest = (value: unknown): value is Record<string, unknown> =>
  isObject(value)
  && isObject(value.plan)
  && isObject(value.env_profile)
  && ((value.version_label === undefined) || isString(value.version_label))
  && ((value.change_summary === undefined) || isString(value.change_summary))
  && ((value.publish === undefined) || isBoolean(value.publish))
  && ((value.default_dataset === undefined) || isDatasetPayload(value.default_dataset));

export const isDatasetRowCreateRequest = (value: unknown): value is Record<string, unknown> =>
  isObject(value)
  && isObject(value.values)
  && ((value.name === undefined) || isString(value.name));

export const isDatasetRowPatchRequest = (value: unknown): value is Record<string, unknown> =>
  isObject(value)
  && ((value.values === undefined) || isObject(value.values))
  && ((value.name === undefined) || isString(value.name));

export const isBindDefaultDatasetRequest = (value: unknown): value is Record<string, unknown> =>
  isObject(value) && isString(value.datasetRowId ?? value.dataset_row_id);

export const isCreateRecordingRequest = (value: unknown): value is Record<string, unknown> =>
  isObject(value)
  && isString(value.tenant_id)
  && isString(value.project_id)
  && isString(value.name)
  && isRecordingSourceType(value.source_type)
  && isObject(value.env_profile);

export const isAppendRecordingEventsRequest = (value: unknown): value is Record<string, unknown> =>
  isObject(value)
  && Array.isArray(value.events)
  && value.events.every(isRecordingEventItemRequest);

export const isPublishRecordingRequest = (value: unknown): value is Record<string, unknown> =>
  isObject(value)
  && ((value.name === undefined) || isString(value.name))
  && ((value.version_label === undefined) || isString(value.version_label))
  && ((value.change_summary === undefined) || isString(value.change_summary))
  && ((value.publish === undefined) || isBoolean(value.publish))
  && ((value.analysis_job_id === undefined) || isString(value.analysis_job_id))
  && ((value.default_dataset === undefined) || isDatasetPayload(value.default_dataset));

export const isExtractTestCaseRequest = (value: unknown): value is Record<string, unknown> =>
  isObject(value)
  && ((value.name === undefined) || isString(value.name))
  && ((value.version_label === undefined) || isString(value.version_label))
  && ((value.change_summary === undefined) || isString(value.change_summary))
  && ((value.publish === undefined) || isBoolean(value.publish))
  && ((value.default_dataset_name === undefined) || isString(value.default_dataset_name));

export const normalizeTestCaseCreateRequest = (value: Record<string, unknown>): ControlPlaneCreateTestCaseInput => ({
  tenantId: String(value.tenant_id),
  projectId: String(value.project_id),
  name: String(value.name),
  plan: value.plan as ControlPlaneCreateTestCaseInput['plan'],
  envProfile: value.env_profile as ControlPlaneCreateTestCaseInput['envProfile'],
  versionLabel: typeof value.version_label === 'string' ? value.version_label : undefined,
  changeSummary: typeof value.change_summary === 'string' ? value.change_summary : undefined,
  publish: isBoolean(value.publish) ? value.publish : undefined,
  defaultDataset: isDatasetPayload(value.default_dataset)
    ? {
      name: typeof value.default_dataset.name === 'string' ? value.default_dataset.name : undefined,
      values: isObject(value.default_dataset.values)
        ? value.default_dataset.values
        : undefined,
    }
    : undefined,
});

export const normalizeTestCasePatchRequest = (value: Record<string, unknown>): ControlPlaneUpdateTestCaseInput => ({
  name: typeof value.name === 'string' ? value.name : undefined,
  status: typeof value.status === 'string'
    ? value.status as ControlPlaneUpdateTestCaseInput['status']
    : undefined,
});

export const normalizeTestCaseVersionCreateRequest = (value: Record<string, unknown>): ControlPlaneCreateTestCaseVersionInput => ({
  plan: value.plan as ControlPlaneCreateTestCaseVersionInput['plan'],
  envProfile: value.env_profile as ControlPlaneCreateTestCaseVersionInput['envProfile'],
  versionLabel: typeof value.version_label === 'string' ? value.version_label : undefined,
  changeSummary: typeof value.change_summary === 'string' ? value.change_summary : undefined,
  publish: isBoolean(value.publish) ? value.publish : undefined,
  defaultDataset: isDatasetPayload(value.default_dataset)
    ? {
      name: typeof value.default_dataset.name === 'string' ? value.default_dataset.name : undefined,
      values: isObject(value.default_dataset.values)
        ? value.default_dataset.values
        : undefined,
    }
    : undefined,
});

export const normalizeDatasetRowCreateRequest = (value: Record<string, unknown>): ControlPlaneCreateDatasetRowInput => ({
  name: typeof value.name === 'string' ? value.name : undefined,
  values: value.values as Record<string, unknown>,
});

export const normalizeDatasetRowPatchRequest = (value: Record<string, unknown>): ControlPlaneUpdateDatasetRowInput => ({
  name: typeof value.name === 'string' ? value.name : undefined,
  values: isObject(value.values) ? value.values : undefined,
});

export const normalizeCreateRecordingRequest = (value: Record<string, unknown>): ControlPlaneCreateRecordingInput => ({
  tenantId: String(value.tenant_id),
  projectId: String(value.project_id),
  name: String(value.name),
  sourceType: String(value.source_type) as ControlPlaneCreateRecordingInput['sourceType'],
  envProfile: value.env_profile as ControlPlaneCreateRecordingInput['envProfile'],
  startedAt: typeof value.started_at === 'string' ? value.started_at : undefined,
  finishedAt: typeof value.finished_at === 'string' ? value.finished_at : undefined,
});

export const normalizeRecordingEventRequests = (value: Record<string, unknown>): ControlPlaneCreateRecordingEventInput[] =>
  ((value.events as Record<string, unknown>[]) ?? []).map((event) => ({
    eventType: String(event.event_type),
    pageUrl: typeof event.page_url === 'string' ? event.page_url : undefined,
    locator: isLocatorDraftShape(event.locator)
      ? event.locator as unknown as ControlPlaneCreateRecordingEventInput['locator']
      : undefined,
    payload: isObject(event.payload) ? event.payload : undefined,
    capturedAt: typeof event.captured_at === 'string' ? event.captured_at : undefined,
  }));

export const normalizePublishRecordingRequest = (value: Record<string, unknown>): ControlPlanePublishRecordingInput => ({
  name: typeof value.name === 'string' ? value.name : undefined,
  versionLabel: typeof value.version_label === 'string' ? value.version_label : undefined,
  changeSummary: typeof value.change_summary === 'string' ? value.change_summary : undefined,
  publish: isBoolean(value.publish) ? value.publish : undefined,
  analysisJobId: typeof value.analysis_job_id === 'string' ? value.analysis_job_id : undefined,
  defaultDataset: isDatasetPayload(value.default_dataset)
    ? {
      name: typeof value.default_dataset.name === 'string' ? value.default_dataset.name : undefined,
      values: isObject(value.default_dataset.values) ? value.default_dataset.values : undefined,
    }
    : undefined,
});

export const normalizeExtractTestCaseRequest = (value: Record<string, unknown>): ControlPlaneExtractTestCaseInput => ({
  name: typeof value.name === 'string' ? value.name : undefined,
  versionLabel: typeof value.version_label === 'string' ? value.version_label : undefined,
  changeSummary: typeof value.change_summary === 'string' ? value.change_summary : undefined,
  publish: isBoolean(value.publish) ? value.publish : undefined,
  defaultDatasetName: typeof value.default_dataset_name === 'string' ? value.default_dataset_name : undefined,
});

export const normalizeRegisterAgent = (value: Record<string, unknown>): ControlPlaneRegisterAgentInput => ({
  agentId: String(value.agentId ?? value.agent_id),
  tenantId: String(value.tenantId ?? value.tenant_id),
  projectId: typeof (value.projectId ?? value.project_id) === 'string' ? String(value.projectId ?? value.project_id) : undefined,
  name: String(value.name),
  platform: String(value.platform),
  architecture: String(value.architecture),
  runtimeKind: String(value.runtimeKind ?? value.runtime_kind),
  capabilities: (value.capabilities as string[]) ?? [],
  metadata: isObject(value.metadata) ? value.metadata : undefined,
  status: typeof value.status === 'string' ? value.status : undefined,
  maxParallelSlots: isPositiveInteger(value.maxParallelSlots ?? value.max_parallel_slots)
    ? Number(value.maxParallelSlots ?? value.max_parallel_slots)
    : undefined,
});

export const normalizeHeartbeatAgent = (value: Record<string, unknown>): ControlPlaneHeartbeatAgentInput => ({
  status: typeof value.status === 'string' ? value.status : undefined,
  capabilities: isStringArray(value.capabilities) ? value.capabilities : undefined,
  metadata: isObject(value.metadata) ? value.metadata : undefined,
  maxParallelSlots: isPositiveInteger(value.maxParallelSlots ?? value.max_parallel_slots)
    ? Number(value.maxParallelSlots ?? value.max_parallel_slots)
    : undefined,
});

export const normalizeAcquireLease = (value: Record<string, unknown>): ControlPlaneAcquireLeaseInput => ({
  supportedJobKinds: (value.supportedJobKinds ?? value.supported_job_kinds) as string[],
  leaseTtlSeconds: Number(value.leaseTtlSeconds ?? value.lease_ttl_seconds),
});

export const normalizeHeartbeatLease = (value: Record<string, unknown>): ControlPlaneHeartbeatLeaseInput => ({
  leaseTtlSeconds: Number(value.leaseTtlSeconds ?? value.lease_ttl_seconds),
});

export const buildDecision = (request: StepOverrideRequest): StepControlResponse => ({
  action: request.action,
  reason: request.reason,
  replacement_step: request.replacement_step,
  resume_after_ms: request.resume_after_ms,
});
