import { Pool } from 'pg';
import type {
  ControlPlaneStateSnapshot,
  ControlPlaneStore,
  RecordedRunnerEvent,
  RecordRunnerEventResult,
  RunnerResultEnvelope,
} from '../types.js';
import type { CompiledStep } from '@aiwtp/web-dsl-schema';
import type { StepControlResponse } from '@aiwtp/web-worker';
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
  sourceStepId: envelope.event_type === 'step.result_reported' ? envelope.payload.source_step_id : null,
  status: envelope.payload.status,
  envelopeJson: JSON.stringify(envelope),
});

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
    const event = toRunnerEventFields(envelope);
    try {
      await this.pool.query(
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
      return { duplicate: false };
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        return { duplicate: true };
      }
      throw error;
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
    await this.pool.query(
      `insert into control_plane_step_decisions (
         job_id,
         source_step_id,
         action,
         reason,
         replacement_step_json,
         resume_after_ms
       ) values ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        jobId,
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
         from control_plane_step_decisions
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
        `update control_plane_step_decisions
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
         from control_plane_step_decisions
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
}
