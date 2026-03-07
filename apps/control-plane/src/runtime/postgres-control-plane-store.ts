import { Pool } from 'pg';
import type {
  ControlPlaneStateSnapshot,
  ControlPlaneStore,
  RecordedRunnerEvent,
  RecordRunnerEventResult,
  RunnerResultEnvelope,
} from '../types.js';
import type { CompiledStep } from '@aiwtp/web-dsl-schema';
import type {
  ResultReportedEnvelope,
  StepResultPayload,
  StepResultReportedEnvelope,
  StepControlResponse,
} from '@aiwtp/web-worker';
import { CONTROL_PLANE_POSTGRES_SCHEMA_SQL } from './postgres-schema.js';

interface SqlQueryResult<Row> {
  rows: Row[];
  rowCount?: number | null;
}

export interface SqlPoolClientLike {
  query<Row = Record<string, unknown>>(text: string, values?: unknown[]): Promise<SqlQueryResult<Row>>;
  release(): void;
}

export interface SqlPoolLike {
  query<Row = Record<string, unknown>>(text: string, values?: unknown[]): Promise<SqlQueryResult<Row>>;
  connect(): Promise<SqlPoolClientLike>;
  end(): Promise<void>;
}

interface RunnerEventRow {
  job_id: string;
  event_id: string;
  envelope_json: RunnerResultEnvelope | string;
}

interface StepDecisionRow {
  decision_id: string;
  action: StepControlResponse['action'];
  reason: string | null;
  replacement_step_json: CompiledStep | string | null;
  resume_after_ms: number | null;
}

interface SnapshotDecisionRow {
  job_id: string;
  source_step_id: string;
  action: StepControlResponse['action'];
  reason: string | null;
  replacement_step_json: CompiledStep | string | null;
  resume_after_ms: number | null;
}

interface RunRow {
  run_id: string;
  status: string;
}

interface RunItemRow {
  run_item_id: string;
  status: string;
}

interface StepDecisionLookupRow {
  run_id: string;
  run_item_id: string;
}

export interface PostgresControlPlaneStoreOptions {
  connectionString?: string;
  pool?: SqlPoolLike;
  autoMigrate?: boolean;
}

const parseJsonColumn = <T>(value: T | string | null): T | null => {
  if (value == null) {
    return null;
  }

  return typeof value === 'string' ? JSON.parse(value) as T : value;
};

const isStepResultEnvelope = (envelope: RunnerResultEnvelope): envelope is StepResultReportedEnvelope =>
  envelope.event_type === 'step.result_reported';

const isJobResultEnvelope = (envelope: RunnerResultEnvelope): envelope is ResultReportedEnvelope =>
  envelope.event_type === 'job.result_reported';

const buildStepDecision = (row: StepDecisionRow | SnapshotDecisionRow): StepControlResponse => ({
  action: row.action,
  reason: row.reason ?? undefined,
  replacement_step: parseJsonColumn<CompiledStep>(row.replacement_step_json) ?? undefined,
  resume_after_ms: row.resume_after_ms ?? undefined,
});

const toRunnerEventFields = (envelope: RunnerResultEnvelope) => ({
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

const toProjectionStatus = (envelope: RunnerResultEnvelope): string => {
  if (isJobResultEnvelope(envelope)) {
    return envelope.payload.status;
  }
  return 'running';
};

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

const buildStepEventValues = (envelope: StepResultReportedEnvelope) => ({
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

const upsertProjectionStatusSql = (tableName: 'runs' | 'run_items', keyField: 'run_id' | 'run_item_id') => `
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

export class PostgresControlPlaneStore implements ControlPlaneStore {
  private constructor(
    private readonly pool: SqlPoolLike,
    private readonly ownPool: boolean,
  ) {}

  static async open(options: PostgresControlPlaneStoreOptions = {}): Promise<PostgresControlPlaneStore> {
    const pool = options.pool ?? new Pool({ connectionString: options.connectionString });
    const store = new PostgresControlPlaneStore(pool, !options.pool);
    if (options.autoMigrate !== false) {
      await store.ensureSchema();
    }
    return store;
  }

  async recordRunnerEvent(envelope: RunnerResultEnvelope): Promise<RecordRunnerEventResult> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const event = toRunnerEventFields(envelope);
      try {
        await client.query(
          `insert into control_plane_runner_events (
             event_id,
             event_type,
             tenant_id,
             project_id,
             trace_id,
             correlation_id,
             job_id,
             run_id,
             run_item_id,
             attempt_no,
             source_step_id,
             status,
             envelope_json
           ) values (
             $1, $2, $3, $4, $5, $6,
             $7, $8, $9, $10, $11, $12, $13::jsonb
           )`,
          [
            event.eventId,
            event.eventType,
            event.tenantId,
            event.projectId,
            event.traceId,
            event.correlationId,
            event.jobId,
            event.runId,
            event.runItemId,
            event.attemptNo,
            event.sourceStepId,
            event.status,
            event.envelopeJson,
          ],
        );
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          await client.query('rollback');
          return { duplicate: true };
        }
        throw error;
      }

      await this.upsertRunProjection(client, envelope);
      await this.upsertRunItemProjection(client, envelope);
      await this.linkStepDecisions(client, envelope);
      if (isStepResultEnvelope(envelope)) {
        await this.insertStepEventProjection(client, envelope);
      }

      await client.query('commit');
      return { duplicate: false };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async listJobEvents(jobId: string): Promise<RecordedRunnerEvent[]> {
    const result = await this.pool.query<RunnerEventRow>(
      `select job_id, event_id, envelope_json
       from control_plane_runner_events
       where job_id = $1
       order by received_at asc, event_id asc`,
      [jobId],
    );

    return result.rows.map((row) => ({
      receivedAt: parseJsonColumn<RunnerResultEnvelope>(row.envelope_json)?.occurred_at ?? new Date().toISOString(),
      envelope: parseJsonColumn<RunnerResultEnvelope>(row.envelope_json) as RunnerResultEnvelope,
    }));
  }

  async enqueueStepDecision(jobId: string, sourceStepId: string, decision: StepControlResponse): Promise<void> {
    const lookup = await this.pool.query<StepDecisionLookupRow>(
      `select run_id, run_item_id
       from run_items
       where job_id = $1
       limit 1`,
      [jobId],
    );
    const related = lookup.rows[0];

    await this.pool.query(
      `insert into step_decisions (
         job_id,
         run_id,
         run_item_id,
         source_step_id,
         action,
         reason,
         replacement_step_json,
         resume_after_ms
       ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [
        jobId,
        related?.run_id ?? null,
        related?.run_item_id ?? null,
        sourceStepId,
        decision.action,
        decision.reason ?? null,
        decision.replacement_step ? JSON.stringify(decision.replacement_step) : null,
        decision.resume_after_ms ?? null,
      ],
    );
  }

  async dequeueStepDecision(jobId: string, sourceStepId: string): Promise<StepControlResponse | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const decisionResult = await client.query<StepDecisionRow>(
        `select decision_id, action, reason, replacement_step_json, resume_after_ms
         from step_decisions
         where job_id = $1
           and source_step_id = $2
           and consumed_at is null
         order by decision_id asc
         limit 1`,
        [jobId, sourceStepId],
      );

      if (decisionResult.rows.length === 0) {
        await client.query('rollback');
        return undefined;
      }

      const decisionRow = decisionResult.rows[0];
      const updateResult = await client.query(
        `update step_decisions
         set consumed_at = now()
         where decision_id = $1
           and consumed_at is null`,
        [decisionRow.decision_id],
      );

      if ((updateResult.rowCount ?? 0) !== 1) {
        await client.query('rollback');
        return undefined;
      }

      await client.query('commit');
      return buildStepDecision(decisionRow);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async snapshot(): Promise<ControlPlaneStateSnapshot> {
    const [eventsResult, decisionsResult] = await Promise.all([
      this.pool.query<RunnerEventRow>(
        `select job_id, event_id, envelope_json
         from control_plane_runner_events
         order by received_at asc, event_id asc`,
      ),
      this.pool.query<SnapshotDecisionRow>(
        `select job_id, source_step_id, action, reason, replacement_step_json, resume_after_ms
         from step_decisions
         where consumed_at is null
         order by decision_id asc`,
      ),
    ]);

    const eventsByJob: ControlPlaneStateSnapshot['eventsByJob'] = {};
    for (const row of eventsResult.rows) {
      const envelope = parseJsonColumn<RunnerResultEnvelope>(row.envelope_json) as RunnerResultEnvelope;
      const events = eventsByJob[row.job_id] ?? [];
      events.push({
        receivedAt: envelope.occurred_at,
        envelope,
      });
      eventsByJob[row.job_id] = events;
    }

    const pendingDecisionsByJob: ControlPlaneStateSnapshot['pendingDecisionsByJob'] = {};
    for (const row of decisionsResult.rows) {
      const byStep = pendingDecisionsByJob[row.job_id] ?? {};
      const queue = byStep[row.source_step_id] ?? [];
      queue.push(buildStepDecision(row));
      byStep[row.source_step_id] = queue;
      pendingDecisionsByJob[row.job_id] = byStep;
    }

    return {
      eventsByJob,
      pendingDecisionsByJob,
      receivedEventIds: eventsResult.rows.map((row) => row.event_id),
    };
  }

  async ensureSchema(): Promise<void> {
    await this.pool.query(CONTROL_PLANE_POSTGRES_SCHEMA_SQL);
  }

  async close(): Promise<void> {
    if (this.ownPool) {
      await this.pool.end();
    }
  }

  private async upsertRunProjection(client: SqlPoolClientLike, envelope: RunnerResultEnvelope): Promise<void> {
    const timestamps = toProjectionTimestamps(envelope);
    await client.query(
      upsertProjectionStatusSql('runs', 'run_id'),
      [
        envelope.payload.run_id,
        envelope.tenant_id,
        envelope.project_id,
        toProjectionStatus(envelope),
        timestamps.startedAt,
        timestamps.finishedAt,
        envelope.event_id,
      ],
    );
  }

  private async upsertRunItemProjection(client: SqlPoolClientLike, envelope: RunnerResultEnvelope): Promise<void> {
    const timestamps = toProjectionTimestamps(envelope);
    await client.query(
      `insert into run_items (
         run_item_id,
         run_id,
         job_id,
         tenant_id,
         project_id,
         attempt_no,
         status,
         started_at,
         finished_at,
         last_event_id
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       on conflict (run_item_id) do update set
         run_id = excluded.run_id,
         job_id = excluded.job_id,
         tenant_id = excluded.tenant_id,
         project_id = excluded.project_id,
         attempt_no = excluded.attempt_no,
         status = case
           when excluded.status = 'running' and run_items.status in ('passed', 'failed', 'canceled') then run_items.status
           else excluded.status
         end,
         started_at = coalesce(run_items.started_at, excluded.started_at),
         finished_at = coalesce(excluded.finished_at, run_items.finished_at),
         last_event_id = excluded.last_event_id,
         updated_at = now()`,
      [
        envelope.payload.run_item_id,
        envelope.payload.run_id,
        envelope.payload.job_id,
        envelope.tenant_id,
        envelope.project_id,
        envelope.payload.attempt_no,
        toProjectionStatus(envelope),
        timestamps.startedAt,
        timestamps.finishedAt,
        envelope.event_id,
      ],
    );
  }

  private async insertStepEventProjection(client: SqlPoolClientLike, envelope: StepResultReportedEnvelope): Promise<void> {
    const stepEvent = buildStepEventValues(envelope);
    await client.query(
      `insert into step_events (
         event_id,
         run_id,
         run_item_id,
         job_id,
         tenant_id,
         project_id,
         attempt_no,
         compiled_step_id,
         source_step_id,
         status,
         started_at,
         finished_at,
         duration_ms,
         error_code,
         error_message,
         artifacts_json,
         extracted_variables_json,
         envelope_json
       ) values (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15, $16::jsonb, $17::jsonb, $18::jsonb
       )`,
      [
        stepEvent.eventId,
        stepEvent.runId,
        stepEvent.runItemId,
        stepEvent.jobId,
        stepEvent.tenantId,
        stepEvent.projectId,
        stepEvent.attemptNo,
        stepEvent.compiledStepId,
        stepEvent.sourceStepId,
        stepEvent.status,
        stepEvent.startedAt,
        stepEvent.finishedAt,
        stepEvent.durationMs,
        stepEvent.errorCode,
        stepEvent.errorMessage,
        stepEvent.artifactsJson,
        stepEvent.extractedVariablesJson,
        stepEvent.envelopeJson,
      ],
    );
  }

  private async linkStepDecisions(client: SqlPoolClientLike, envelope: RunnerResultEnvelope): Promise<void> {
    await client.query(
      `update step_decisions
       set run_id = coalesce(run_id, $1),
           run_item_id = coalesce(run_item_id, $2)
       where job_id = $3
         and (run_id is null or run_item_id is null)`,
      [
        envelope.payload.run_id,
        envelope.payload.run_item_id,
        envelope.payload.job_id,
      ],
    );
  }
}
