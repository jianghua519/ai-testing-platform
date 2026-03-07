import { Pool } from 'pg';
import type {
  ControlPlaneListRunItemsQuery,
  ControlPlaneListRunsQuery,
  ControlPlaneListStepEventsQuery,
  ControlPlaneMigrationRecord,
  ControlPlanePage,
  ControlPlaneRunItemRecord,
  ControlPlaneRunRecord,
  ControlPlaneStateSnapshot,
  ControlPlaneStepEventRecord,
  ControlPlaneStore,
  RecordedRunnerEvent,
  RecordRunnerEventResult,
  RunnerResultEnvelope,
} from '../types.js';
import type { CompiledStep } from '@aiwtp/web-dsl-schema';
import type {
  ResultReportedEnvelope,
  StepResultReportedEnvelope,
  StepControlResponse,
} from '@aiwtp/web-worker';
import {
  listControlPlanePostgresMigrations,
  runControlPlanePostgresMigrations,
} from './postgres-migrations.js';
import { decodeCursor, encodeCursor } from './pagination.js';

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

interface StepDecisionLookupRow {
  run_id: string;
  run_item_id: string;
}

interface RunProjectionRow {
  run_id: string;
  tenant_id: string;
  project_id: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  last_event_id: string;
  created_at: string | null;
  updated_at: string | null;
}

interface RunItemProjectionRow {
  run_item_id: string;
  run_id: string;
  job_id: string;
  tenant_id: string;
  project_id: string;
  attempt_no: number;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  last_event_id: string;
  created_at: string | null;
  updated_at: string | null;
}

interface StepEventProjectionRow {
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

export interface PostgresControlPlaneStoreOptions {
  connectionString?: string;
  pool?: SqlPoolLike;
  runMigrations?: boolean;
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

const mapRunProjection = (row: RunProjectionRow): ControlPlaneRunRecord => ({
  runId: row.run_id,
  tenantId: row.tenant_id,
  projectId: row.project_id,
  status: row.status,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  lastEventId: row.last_event_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapRunItemProjection = (row: RunItemProjectionRow): ControlPlaneRunItemRecord => ({
  runItemId: row.run_item_id,
  runId: row.run_id,
  jobId: row.job_id,
  tenantId: row.tenant_id,
  projectId: row.project_id,
  attemptNo: row.attempt_no,
  status: row.status,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  lastEventId: row.last_event_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapStepEventProjection = (row: StepEventProjectionRow): ControlPlaneStepEventRecord => ({
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

const toPage = <T>(items: T[], limit: number, getCursor: (item: T) => { primary: string; secondary: string }): ControlPlanePage<T> => {
  const visibleItems = items.slice(0, limit);
  const nextCursor = items.length > limit && visibleItems.length > 0
    ? encodeCursor(getCursor(visibleItems[visibleItems.length - 1]))
    : undefined;

  return {
    items: visibleItems,
    nextCursor,
  };
};

export class PostgresControlPlaneStore implements ControlPlaneStore {
  private constructor(
    private readonly pool: SqlPoolLike,
    private readonly ownPool: boolean,
  ) {}

  static async open(options: PostgresControlPlaneStoreOptions = {}): Promise<PostgresControlPlaneStore> {
    const pool = options.pool ?? new Pool({ connectionString: options.connectionString });
    const store = new PostgresControlPlaneStore(pool, !options.pool);
    const shouldRunMigrations = options.runMigrations ?? options.autoMigrate ?? true;
    if (shouldRunMigrations) {
      await store.runMigrations();
    }
    return store;
  }

  async runMigrations(): Promise<ControlPlaneMigrationRecord[]> {
    return runControlPlanePostgresMigrations(this.pool);
  }

  async listAppliedMigrations(): Promise<ControlPlaneMigrationRecord[]> {
    return listControlPlanePostgresMigrations(this.pool);
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

    return result.rows.map((row) => {
      const envelope = parseJsonColumn<RunnerResultEnvelope>(row.envelope_json) as RunnerResultEnvelope;
      return {
        receivedAt: envelope.occurred_at,
        envelope,
      };
    });
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

  async getRun(runId: string): Promise<ControlPlaneRunRecord | undefined> {
    const result = await this.pool.query<RunProjectionRow>(
      `select run_id, tenant_id, project_id, status, started_at, finished_at, last_event_id, created_at, updated_at
       from runs
       where run_id = $1
       limit 1`,
      [runId],
    );
    return result.rows[0] ? mapRunProjection(result.rows[0]) : undefined;
  }

  async listRuns(query: ControlPlaneListRunsQuery): Promise<ControlPlanePage<ControlPlaneRunRecord>> {
    const cursor = decodeCursor(query.cursor);
    const values: unknown[] = [query.tenantId, query.projectId];
    let sql = `select run_id, tenant_id, project_id, status, started_at, finished_at, last_event_id, created_at, updated_at
       from runs
       where tenant_id = $1
         and project_id = $2`;

    if (cursor) {
      values.push(cursor.primary, cursor.secondary);
      sql += `
         and (created_at, run_id) < ($3::timestamptz, $4)`;
    }

    values.push(query.limit + 1);
    sql += `
       order by created_at desc, run_id desc
       limit $${values.length}`;

    const result = await this.pool.query<RunProjectionRow>(sql, values);
    return toPage(result.rows.map(mapRunProjection), query.limit, (run) => ({
      primary: run.createdAt ?? '',
      secondary: run.runId,
    }));
  }

  async getRunItem(runItemId: string): Promise<ControlPlaneRunItemRecord | undefined> {
    const result = await this.pool.query<RunItemProjectionRow>(
      `select run_item_id, run_id, job_id, tenant_id, project_id, attempt_no, status, started_at, finished_at, last_event_id, created_at, updated_at
       from run_items
       where run_item_id = $1
       limit 1`,
      [runItemId],
    );
    return result.rows[0] ? mapRunItemProjection(result.rows[0]) : undefined;
  }

  async listRunItems(query: ControlPlaneListRunItemsQuery): Promise<ControlPlanePage<ControlPlaneRunItemRecord>> {
    const cursor = decodeCursor(query.cursor);
    const values: unknown[] = [query.runId];
    let sql = `select run_item_id, run_id, job_id, tenant_id, project_id, attempt_no, status, started_at, finished_at, last_event_id, created_at, updated_at
       from run_items
       where run_id = $1`;

    if (cursor) {
      values.push(cursor.primary, cursor.secondary);
      sql += `
         and (created_at, run_item_id) < ($2::timestamptz, $3)`;
    }

    values.push(query.limit + 1);
    sql += `
       order by created_at desc, run_item_id desc
       limit $${values.length}`;

    const result = await this.pool.query<RunItemProjectionRow>(sql, values);
    return toPage(result.rows.map(mapRunItemProjection), query.limit, (runItem) => ({
      primary: runItem.createdAt ?? '',
      secondary: runItem.runItemId,
    }));
  }

  async listStepEventsByRun(runId: string, query: ControlPlaneListStepEventsQuery): Promise<ControlPlanePage<ControlPlaneStepEventRecord>> {
    const cursor = decodeCursor(query.cursor);
    const values: unknown[] = [runId];
    let sql = `select event_id, run_id, run_item_id, job_id, tenant_id, project_id, attempt_no, compiled_step_id, source_step_id, status,
                      started_at, finished_at, duration_ms, error_code, error_message, artifacts_json, extracted_variables_json, received_at
       from step_events
       where run_id = $1`;

    if (cursor) {
      values.push(cursor.primary, cursor.secondary);
      sql += `
         and (received_at, event_id) < ($2::timestamptz, $3)`;
    }

    values.push(query.limit + 1);
    sql += `
       order by received_at desc, event_id desc
       limit $${values.length}`;

    const result = await this.pool.query<StepEventProjectionRow>(sql, values);
    return toPage(result.rows.map(mapStepEventProjection), query.limit, (stepEvent) => ({
      primary: stepEvent.receivedAt,
      secondary: stepEvent.eventId,
    }));
  }

  async listStepEventsByRunItem(runItemId: string, query: ControlPlaneListStepEventsQuery): Promise<ControlPlanePage<ControlPlaneStepEventRecord>> {
    const cursor = decodeCursor(query.cursor);
    const values: unknown[] = [runItemId];
    let sql = `select event_id, run_id, run_item_id, job_id, tenant_id, project_id, attempt_no, compiled_step_id, source_step_id, status,
                      started_at, finished_at, duration_ms, error_code, error_message, artifacts_json, extracted_variables_json, received_at
       from step_events
       where run_item_id = $1`;

    if (cursor) {
      values.push(cursor.primary, cursor.secondary);
      sql += `
         and (received_at, event_id) < ($2::timestamptz, $3)`;
    }

    values.push(query.limit + 1);
    sql += `
       order by received_at desc, event_id desc
       limit $${values.length}`;

    const result = await this.pool.query<StepEventProjectionRow>(sql, values);
    return toPage(result.rows.map(mapStepEventProjection), query.limit, (stepEvent) => ({
      primary: stepEvent.receivedAt,
      secondary: stepEvent.eventId,
    }));
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
