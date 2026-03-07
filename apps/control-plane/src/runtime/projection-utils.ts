import type { ResultReportedEnvelope, StepResultReportedEnvelope } from '@aiwtp/web-worker';
import type {
  ControlPlaneRunItemRecord,
  ControlPlaneRunRecord,
  ControlPlaneStepEventRecord,
  RecordedRunnerEvent,
  RunnerResultEnvelope,
} from '../types.js';

const isStepResultEnvelope = (envelope: RunnerResultEnvelope): envelope is StepResultReportedEnvelope =>
  envelope.event_type === 'step.result_reported';

const isJobResultEnvelope = (envelope: RunnerResultEnvelope): envelope is ResultReportedEnvelope =>
  envelope.event_type === 'job.result_reported';

const toProjectionStatus = (envelope: RunnerResultEnvelope): string =>
  isJobResultEnvelope(envelope) ? envelope.payload.status : 'running';

const toProjectionTimestamps = (envelope: RunnerResultEnvelope): { startedAt: string | null; finishedAt: string | null } => {
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

const mergeProjectionStatus = (currentStatus: string, nextStatus: string): string => {
  if (nextStatus === 'running' && ['passed', 'failed', 'canceled'].includes(currentStatus)) {
    return currentStatus;
  }
  return nextStatus;
};

const upsertRunProjection = (record: ControlPlaneRunRecord | undefined, event: RecordedRunnerEvent): ControlPlaneRunRecord => {
  const timestamps = toProjectionTimestamps(event.envelope);
  if (!record) {
    return {
      runId: event.envelope.payload.run_id,
      tenantId: event.envelope.tenant_id,
      projectId: event.envelope.project_id,
      status: toProjectionStatus(event.envelope),
      startedAt: timestamps.startedAt,
      finishedAt: timestamps.finishedAt,
      lastEventId: event.envelope.event_id,
      createdAt: event.receivedAt,
      updatedAt: event.receivedAt,
    };
  }

  return {
    ...record,
    tenantId: event.envelope.tenant_id,
    projectId: event.envelope.project_id,
    status: mergeProjectionStatus(record.status, toProjectionStatus(event.envelope)),
    startedAt: record.startedAt ?? timestamps.startedAt,
    finishedAt: timestamps.finishedAt ?? record.finishedAt,
    lastEventId: event.envelope.event_id,
    updatedAt: event.receivedAt,
  };
};

const upsertRunItemProjection = (record: ControlPlaneRunItemRecord | undefined, event: RecordedRunnerEvent): ControlPlaneRunItemRecord => {
  const timestamps = toProjectionTimestamps(event.envelope);
  if (!record) {
    return {
      runItemId: event.envelope.payload.run_item_id,
      runId: event.envelope.payload.run_id,
      jobId: event.envelope.payload.job_id,
      tenantId: event.envelope.tenant_id,
      projectId: event.envelope.project_id,
      attemptNo: event.envelope.payload.attempt_no,
      status: toProjectionStatus(event.envelope),
      startedAt: timestamps.startedAt,
      finishedAt: timestamps.finishedAt,
      lastEventId: event.envelope.event_id,
      createdAt: event.receivedAt,
      updatedAt: event.receivedAt,
    };
  }

  return {
    ...record,
    runId: event.envelope.payload.run_id,
    jobId: event.envelope.payload.job_id,
    tenantId: event.envelope.tenant_id,
    projectId: event.envelope.project_id,
    attemptNo: event.envelope.payload.attempt_no,
    status: mergeProjectionStatus(record.status, toProjectionStatus(event.envelope)),
    startedAt: record.startedAt ?? timestamps.startedAt,
    finishedAt: timestamps.finishedAt ?? record.finishedAt,
    lastEventId: event.envelope.event_id,
    updatedAt: event.receivedAt,
  };
};

export interface BuiltControlPlaneProjections {
  runsById: Map<string, ControlPlaneRunRecord>;
  runItemsById: Map<string, ControlPlaneRunItemRecord>;
  stepEventsByRunItemId: Map<string, ControlPlaneStepEventRecord[]>;
}

export const buildControlPlaneProjections = (events: RecordedRunnerEvent[]): BuiltControlPlaneProjections => {
  const runsById = new Map<string, ControlPlaneRunRecord>();
  const runItemsById = new Map<string, ControlPlaneRunItemRecord>();
  const stepEventsByRunItemId = new Map<string, ControlPlaneStepEventRecord[]>();

  for (const event of events) {
    runsById.set(event.envelope.payload.run_id, upsertRunProjection(runsById.get(event.envelope.payload.run_id), event));
    runItemsById.set(event.envelope.payload.run_item_id, upsertRunItemProjection(runItemsById.get(event.envelope.payload.run_item_id), event));

    if (!isStepResultEnvelope(event.envelope)) {
      continue;
    }

    const stepEvents = stepEventsByRunItemId.get(event.envelope.payload.run_item_id) ?? [];
    stepEvents.push({
      eventId: event.envelope.event_id,
      runId: event.envelope.payload.run_id,
      runItemId: event.envelope.payload.run_item_id,
      jobId: event.envelope.payload.job_id,
      tenantId: event.envelope.tenant_id,
      projectId: event.envelope.project_id,
      attemptNo: event.envelope.payload.attempt_no,
      compiledStepId: event.envelope.payload.compiled_step_id,
      sourceStepId: event.envelope.payload.source_step_id,
      status: event.envelope.payload.status,
      startedAt: event.envelope.payload.started_at,
      finishedAt: event.envelope.payload.finished_at,
      durationMs: event.envelope.payload.duration_ms,
      errorCode: event.envelope.payload.error?.code ?? null,
      errorMessage: event.envelope.payload.error?.message ?? null,
      artifacts: event.envelope.payload.artifacts ?? [],
      extractedVariables: event.envelope.payload.extracted_variables ?? [],
      receivedAt: event.receivedAt,
    });
    stepEventsByRunItemId.set(event.envelope.payload.run_item_id, stepEvents);
  }

  return {
    runsById,
    runItemsById,
    stepEventsByRunItemId,
  };
};
