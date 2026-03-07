import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type {
  ControlPlaneAcquireLeaseInput,
  ControlPlaneAcquireLeaseResult,
  ControlPlaneArtifactRecord,
  ControlPlaneAuthenticatedActor,
  ControlPlaneCompleteLeaseInput,
  ControlPlaneEnqueueWebRunInput,
  ControlPlaneEnqueueWebRunResult,
  ControlPlaneHeartbeatAgentInput,
  ControlPlaneHeartbeatLeaseInput,
  ControlPlaneJobLeaseRecord,
  ControlPlaneAgentRecord,
  ControlPlaneListArtifactsQuery,
  ControlPlaneListExpiredArtifactsQuery,
  ControlPlaneListRunItemsQuery,
  ControlPlaneListRunsQuery,
  ControlPlaneListStepEventsQuery,
  ControlPlaneMigrationRecord,
  ControlPlanePage,
  ControlPlanePrincipal,
  ControlPlaneRegisterAgentInput,
  ControlPlaneRunItemRecord,
  ControlPlaneRunRecord,
  ControlPlaneStateSnapshot,
  ControlPlaneStepEventRecord,
  ControlPlaneStore,
  RecordedRunnerEvent,
  RecordRunnerEventResult,
  RunnerResultEnvelope,
} from '../types.js';
import type { ArtifactReference, CompiledStep } from '@aiwtp/web-dsl-schema';
import type {
  ResultReportedEnvelope,
  StepResultReportedEnvelope,
  StepControlResponse,
  WebWorkerJob,
} from '@aiwtp/web-worker';
import {
  listControlPlanePostgresMigrations,
  runControlPlanePostgresMigrations,
} from './postgres-migrations.js';
import { buildWebRunRequiredCapabilities, normalizeCapabilities } from './job-capabilities.js';
import { decodeCursor, encodeCursor } from './pagination.js';
import { buildTenantBusinessSchemaSql, quotePostgresIdentifier } from './postgres-schema.js';

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

interface RunProjectionRow {
  run_id: string;
  tenant_id: string;
  project_id: string;
  name: string | null;
  mode: string | null;
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
  job_kind: string | null;
  required_capabilities_json: string[] | string;
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

interface QueuedRunItemRow {
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

interface AgentRow {
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

interface ArtifactRow {
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

interface LeaseRow {
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

interface ExpiredLeaseRow {
  run_id: string | null;
  run_item_id: string | null;
}

interface EntityLocatorRow {
  tenant_id: string;
  project_id: string | null;
  run_id?: string | null;
  run_item_id?: string | null;
  job_id?: string | null;
  agent_id?: string | null;
}

interface TenantSchemaRow {
  tenant_id: string;
  schema_name: string;
}

interface SubjectProjectMembershipRow {
  tenant_id: string;
  subject_id: string;
  project_id: string;
  roles_json: string[] | string;
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

const isObjectRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isArtifactReference = (value: unknown): value is ArtifactReference =>
  typeof value === 'object'
  && value !== null
  && typeof (value as ArtifactReference).kind === 'string'
  && typeof (value as ArtifactReference).uri === 'string';

const resolveArtifactRetentionExpiresAt = (artifact: ArtifactReference): string | null => {
  if (typeof artifact.retentionExpiresAt === 'string' && artifact.retentionExpiresAt.length > 0) {
    return artifact.retentionExpiresAt;
  }

  if (isObjectRecord(artifact.metadata) && typeof artifact.metadata.retention_expires_at === 'string') {
    return artifact.metadata.retention_expires_at;
  }

  return null;
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

const upsertProjectionStatusSql = (tableName: string, keyField: 'run_id' | 'run_item_id') => `
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
  name: row.name,
  mode: row.mode,
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
  jobKind: row.job_kind,
  requiredCapabilities: parseJsonColumn<string[]>(row.required_capabilities_json) ?? [],
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

const mapAgent = (row: AgentRow): ControlPlaneAgentRecord => ({
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

const mapArtifact = (row: ArtifactRow): ControlPlaneArtifactRecord => ({
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

const mapLease = (row: LeaseRow): ControlPlaneJobLeaseRecord => ({
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

const mapCompletionToProjectionStatus = (status: ControlPlaneCompleteLeaseInput['status']): 'passed' | 'failed' | 'canceled' => {
  switch (status) {
    case 'succeeded':
      return 'passed';
    case 'failed':
      return 'failed';
    case 'canceled':
      return 'canceled';
  }
};

export class PostgresControlPlaneStore implements ControlPlaneStore {
  private readonly ensuredTenantSchemas = new Set<string>();

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

  async resolvePrincipal(actor: ControlPlaneAuthenticatedActor): Promise<ControlPlanePrincipal> {
    const result = await this.pool.query<SubjectProjectMembershipRow>(
      `select tenant_id, subject_id, project_id, roles_json
       from subject_project_memberships
       where tenant_id = $1
         and subject_id = $2
         and status = 'active'
       order by project_id asc`,
      [actor.tenantId, actor.subjectId],
    );

    const projectGrants = result.rows.map((row) => ({
      projectId: row.project_id,
      roles: Array.from(new Set((parseJsonColumn<string[]>(row.roles_json) ?? []).filter((role) => role.length > 0))),
    }));
    const roleSet = new Set<string>();
    for (const grant of projectGrants) {
      for (const role of grant.roles) {
        roleSet.add(role);
      }
    }

    return {
      subjectId: actor.subjectId,
      tenantId: actor.tenantId,
      projectIds: projectGrants.map((grant) => grant.projectId),
      roles: [...roleSet].sort(),
      projectGrants,
    };
  }

  async enqueueWebRun(input: ControlPlaneEnqueueWebRunInput): Promise<ControlPlaneEnqueueWebRunResult> {
    const runId = randomUUID();
    const runItemId = randomUUID();
    const jobId = randomUUID();
    const queueEventId = randomUUID();
    const now = new Date().toISOString();
    const requiredCapabilities = normalizeCapabilities(
      input.requiredCapabilities ?? buildWebRunRequiredCapabilities(input.plan, input.envProfile),
    );
    const job: WebWorkerJob = {
      jobId,
      tenantId: input.tenantId,
      projectId: input.projectId,
      runId,
      runItemId,
      attemptNo: 0,
      traceId: input.traceId ?? randomUUID(),
      correlationId: input.correlationId,
      plan: input.plan,
      envProfile: input.envProfile,
      variableContext: input.variableContext,
    };

    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const tenantSchema = await this.ensureTenantSchema(input.tenantId, client);
      const runsTable = this.tableName(tenantSchema, 'runs');
      const runItemsTable = this.tableName(tenantSchema, 'run_items');
      await client.query(
        `insert into ${runsTable} (
           run_id,
           tenant_id,
           project_id,
           name,
           mode,
           status,
           last_event_id,
           created_at,
           updated_at
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          runId,
          input.tenantId,
          input.projectId,
          input.name,
          input.mode ?? 'standard',
          'queued',
          queueEventId,
          now,
          now,
        ],
      );
      await this.upsertRunLocator(client, runId, input.tenantId, input.projectId);
      await client.query(
        `insert into ${runItemsTable} (
           run_item_id,
           run_id,
           job_id,
           tenant_id,
           project_id,
           attempt_no,
           status,
           job_kind,
           required_capabilities_json,
           job_payload_json,
           last_event_id,
           created_at,
           updated_at
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13)`,
        [
          runItemId,
          runId,
          jobId,
          input.tenantId,
          input.projectId,
          0,
          'pending',
          'web',
          JSON.stringify(requiredCapabilities),
          JSON.stringify(job),
          queueEventId,
          now,
          now,
        ],
      );
      await this.upsertRunItemLocator(client, {
        runItemId,
        runId,
        jobId,
        tenantId: input.tenantId,
        projectId: input.projectId,
      });
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }

    return {
      run: {
        runId,
        tenantId: input.tenantId,
        projectId: input.projectId,
        name: input.name,
        mode: input.mode ?? 'standard',
        status: 'queued',
        startedAt: null,
        finishedAt: null,
        lastEventId: queueEventId,
        createdAt: now,
        updatedAt: now,
      },
      runItem: {
        runItemId,
        runId,
        jobId,
        tenantId: input.tenantId,
        projectId: input.projectId,
        attemptNo: 0,
        status: 'pending',
        jobKind: 'web',
        requiredCapabilities,
        assignedAgentId: null,
        leaseToken: null,
        controlState: 'active',
        controlReason: null,
        startedAt: null,
        finishedAt: null,
        lastEventId: queueEventId,
        createdAt: now,
        updatedAt: now,
      },
      job,
    };
  }

  async registerAgent(input: ControlPlaneRegisterAgentInput): Promise<ControlPlaneAgentRecord> {
    const capabilities = normalizeCapabilities(input.capabilities);
    await this.ensureTenantSchema(input.tenantId);
    const agentsTable = this.tableName(input.tenantId, 'agents');
    const result = await this.pool.query<AgentRow>(
      `insert into ${agentsTable} (
         agent_id,
         tenant_id,
         project_id,
         name,
         platform,
         architecture,
         runtime_kind,
         status,
         capabilities_json,
         metadata_json,
         max_parallel_slots,
         last_heartbeat_at
       ) values (
         $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, now()
       )
       on conflict (agent_id) do update set
         tenant_id = excluded.tenant_id,
         project_id = excluded.project_id,
         name = excluded.name,
         platform = excluded.platform,
         architecture = excluded.architecture,
         runtime_kind = excluded.runtime_kind,
         status = excluded.status,
         capabilities_json = excluded.capabilities_json,
         metadata_json = excluded.metadata_json,
         max_parallel_slots = excluded.max_parallel_slots,
         last_heartbeat_at = now(),
         updated_at = now()
       returning agent_id, tenant_id, project_id, name, platform, architecture, runtime_kind, status,
                 capabilities_json, metadata_json, max_parallel_slots, last_heartbeat_at, created_at, updated_at`,
      [
        input.agentId,
        input.tenantId,
        input.projectId ?? null,
        input.name,
        input.platform,
        input.architecture,
        input.runtimeKind,
        input.status ?? 'online',
        JSON.stringify(capabilities),
        JSON.stringify(input.metadata ?? {}),
        Math.max(1, input.maxParallelSlots ?? 1),
      ],
    );
    await this.upsertAgentLocator(this.pool, input.agentId, input.tenantId, input.projectId ?? null);
    return mapAgent(result.rows[0]);
  }

  async heartbeatAgent(agentId: string, input: ControlPlaneHeartbeatAgentInput): Promise<ControlPlaneAgentRecord | undefined> {
    const locator = await this.getAgentLocator(agentId);
    if (!locator?.tenant_id) {
      return undefined;
    }

    const capabilities = input.capabilities ? normalizeCapabilities(input.capabilities) : undefined;
    const agentsTable = this.tableName(locator.tenant_id, 'agents');
    const result = await this.pool.query<AgentRow>(
      `update ${agentsTable}
       set status = coalesce($2, status),
           capabilities_json = coalesce($3::jsonb, capabilities_json),
           metadata_json = coalesce($4::jsonb, metadata_json),
           max_parallel_slots = coalesce($5, max_parallel_slots),
           last_heartbeat_at = now(),
           updated_at = now()
       where agent_id = $1
       returning agent_id, tenant_id, project_id, name, platform, architecture, runtime_kind, status,
                 capabilities_json, metadata_json, max_parallel_slots, last_heartbeat_at, created_at, updated_at`,
      [
        agentId,
        input.status ?? null,
        capabilities ? JSON.stringify(capabilities) : null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.maxParallelSlots ? Math.max(1, input.maxParallelSlots) : null,
      ],
    );

    return result.rows[0] ? mapAgent(result.rows[0]) : undefined;
  }

  async acquireLease(agentId: string, input: ControlPlaneAcquireLeaseInput): Promise<ControlPlaneAcquireLeaseResult | undefined> {
    const locator = await this.getAgentLocator(agentId);
    if (!locator?.tenant_id) {
      return undefined;
    }

    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const tenantSchema = await this.ensureTenantSchema(locator.tenant_id, client);
      const agentsTable = this.tableName(tenantSchema, 'agents');
      const jobLeasesTable = this.tableName(tenantSchema, 'job_leases');
      const runItemsTable = this.tableName(tenantSchema, 'run_items');
      const runsTable = this.tableName(tenantSchema, 'runs');
      await this.reclaimExpiredLeases(client);

      const agentResult = await client.query<AgentRow>(
        `select agent_id, tenant_id, project_id, name, platform, architecture, runtime_kind, status,
                capabilities_json, metadata_json, max_parallel_slots, last_heartbeat_at, created_at, updated_at
         from ${agentsTable}
         where agent_id = $1
         limit 1
         for update`,
        [agentId],
      );
      if (agentResult.rows.length === 0) {
        await client.query('rollback');
        return undefined;
      }

      const agent = mapAgent(agentResult.rows[0]);
      const supportedJobKinds = input.supportedJobKinds.length > 0 ? input.supportedJobKinds : ['web'];
      const agentCapabilities = normalizeCapabilities(agent.capabilities);
      const activeLeaseCountResult = await client.query<{ active_lease_count: number }>(
        `select count(*)::int as active_lease_count
         from ${jobLeasesTable}
         where agent_id = $1
           and released_at is null`,
        [agentId],
      );
      const activeLeaseCount = activeLeaseCountResult.rows[0]?.active_lease_count ?? 0;
      if (activeLeaseCount >= agent.maxParallelSlots) {
        await client.query('commit');
        return undefined;
      }
      const candidateResult = await client.query<QueuedRunItemRow>(
        `select run_item_id, run_id, job_id, tenant_id, project_id, attempt_no, status, job_kind,
                required_capabilities_json, assigned_agent_id, lease_token, control_state, control_reason,
                last_event_id, created_at, updated_at, job_payload_json
         from ${runItemsTable}
         where tenant_id = $1
           and ($2::text is null or project_id = $2)
           and status = 'pending'
           and control_state = 'active'
           and job_kind = any($3::text[])
           and coalesce(required_capabilities_json, '[]'::jsonb) <@ $4::jsonb
         order by created_at asc, run_item_id asc
         limit 1
         for update skip locked`,
        [agent.tenantId, agent.projectId, supportedJobKinds, JSON.stringify(agentCapabilities)],
      );

      if (candidateResult.rows.length === 0) {
        await client.query('commit');
        return undefined;
      }

      const candidate = candidateResult.rows[0];
      const leaseToken = randomUUID();
      const ttlSeconds = Math.max(10, input.leaseTtlSeconds);
      const leaseResult = await client.query<LeaseRow>(
        `insert into ${jobLeasesTable} (
           job_id,
           run_id,
           run_item_id,
           agent_id,
           lease_token,
           attempt_no,
           status,
           metadata_json,
           expires_at,
           heartbeat_at
         ) values (
           $1, $2, $3, $4, $5, $6, 'leased', '{}'::jsonb, now() + make_interval(secs => $7), now()
         )
         returning lease_id, job_id, run_id, run_item_id, agent_id, lease_token, attempt_no, status,
                   acquired_at, expires_at, heartbeat_at, released_at`,
        [
          candidate.job_id,
          candidate.run_id,
          candidate.run_item_id,
          agentId,
          leaseToken,
          candidate.attempt_no,
          ttlSeconds,
        ],
      );
      await this.upsertLeaseLocator(client, {
        leaseToken,
        jobId: candidate.job_id,
        runId: candidate.run_id,
        runItemId: candidate.run_item_id,
        agentId,
        tenantId: locator.tenant_id,
      });

      await client.query(
        `update ${runItemsTable}
         set status = 'dispatched',
             assigned_agent_id = $2,
             lease_token = $3,
             updated_at = now()
         where run_item_id = $1`,
        [candidate.run_item_id, agentId, leaseToken],
      );
      await client.query(
        `update ${runsTable}
         set status = case when status in ('created', 'queued') then 'running' else status end,
             updated_at = now()
         where run_id = $1`,
        [candidate.run_id],
      );
      await client.query(
        `update ${agentsTable}
         set status = 'online',
             last_heartbeat_at = now(),
             updated_at = now()
         where agent_id = $1`,
        [agentId],
      );

      await client.query('commit');
      return {
        lease: mapLease(leaseResult.rows[0]),
        job: parseJsonColumn<WebWorkerJob>(candidate.job_payload_json) as WebWorkerJob,
      };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async heartbeatLease(leaseToken: string, input: ControlPlaneHeartbeatLeaseInput): Promise<ControlPlaneJobLeaseRecord | undefined> {
    const locator = await this.getLeaseLocator(leaseToken);
    if (!locator?.tenant_id) {
      return undefined;
    }

    const ttlSeconds = Math.max(10, input.leaseTtlSeconds);
    const jobLeasesTable = this.tableName(locator.tenant_id, 'job_leases');
    const result = await this.pool.query<LeaseRow>(
      `update ${jobLeasesTable}
       set heartbeat_at = now(),
           expires_at = now() + make_interval(secs => $2)
       where lease_token = $1
         and released_at is null
       returning lease_id, job_id, run_id, run_item_id, agent_id, lease_token, attempt_no, status,
                 acquired_at, expires_at, heartbeat_at, released_at`,
      [leaseToken, ttlSeconds],
    );

    return result.rows[0] ? mapLease(result.rows[0]) : undefined;
  }

  async completeLease(leaseToken: string, input: ControlPlaneCompleteLeaseInput): Promise<ControlPlaneJobLeaseRecord | undefined> {
    const locator = await this.getLeaseLocator(leaseToken);
    if (!locator?.tenant_id) {
      return undefined;
    }

    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const tenantSchema = await this.ensureTenantSchema(locator.tenant_id, client);
      const jobLeasesTable = this.tableName(tenantSchema, 'job_leases');
      const runItemsTable = this.tableName(tenantSchema, 'run_items');
      const runsTable = this.tableName(tenantSchema, 'runs');
      const mappedStatus = mapCompletionToProjectionStatus(input.status);
      const result = await client.query<LeaseRow>(
        `update ${jobLeasesTable}
         set status = $2,
             released_at = now(),
             heartbeat_at = now()
         where lease_token = $1
           and released_at is null
         returning lease_id, job_id, run_id, run_item_id, agent_id, lease_token, attempt_no, status,
                   acquired_at, expires_at, heartbeat_at, released_at`,
        [leaseToken, input.status],
      );
      if (result.rows.length === 0) {
        const existingResult = await client.query<LeaseRow>(
          `select lease_id, job_id, run_id, run_item_id, agent_id, lease_token, attempt_no, status,
                  acquired_at, expires_at, heartbeat_at, released_at
           from ${jobLeasesTable}
           where lease_token = $1
           limit 1`,
          [leaseToken],
        );
        if (existingResult.rows.length === 0) {
          await client.query('rollback');
          return undefined;
        }

        await client.query('commit');
        return mapLease(existingResult.rows[0]);
      }

      const lease = mapLease(result.rows[0]);
      await client.query(
        `update ${runItemsTable}
         set assigned_agent_id = null,
             lease_token = null,
             control_state = 'active',
             control_reason = null,
             status = case
               when status in ('passed', 'failed', 'canceled') then status
               else $2
             end,
             updated_at = now()
         where run_item_id = $1`,
        [lease.runItemId, mappedStatus],
      );

      if (mappedStatus !== 'passed') {
        await client.query(
          `update ${runsTable}
           set status = case
             when status in ('passed', 'failed', 'canceled') then status
             else $2
           end,
           updated_at = now()
           where run_id = $1`,
          [lease.runId, mappedStatus],
        );
      }

      await client.query('commit');
      return lease;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async pauseRun(runId: string): Promise<ControlPlaneRunRecord | undefined> {
    const locator = await this.getRunLocator(runId);
    if (!locator?.tenant_id) {
      return undefined;
    }

    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const tenantSchema = await this.ensureTenantSchema(locator.tenant_id, client);
      const runsTable = this.tableName(tenantSchema, 'runs');
      const runItemsTable = this.tableName(tenantSchema, 'run_items');
      const runResult = await client.query<RunProjectionRow>(
        `select run_id, tenant_id, project_id, name, mode, status, started_at, finished_at, last_event_id, created_at, updated_at
         from ${runsTable}
         where run_id = $1
         limit 1
         for update`,
        [runId],
      );
      if (runResult.rows.length === 0) {
        await client.query('rollback');
        return undefined;
      }

      await client.query(
        `update ${runItemsTable}
         set control_state = case
               when status in ('passed', 'failed', 'canceled') then control_state
               else 'pause_requested'
             end,
             control_reason = case
               when status in ('passed', 'failed', 'canceled') then control_reason
               else 'run paused by control plane'
             end,
             updated_at = now()
         where run_id = $1`,
        [runId],
      );
      await client.query(
        `update ${runsTable}
         set updated_at = now()
         where run_id = $1`,
        [runId],
      );

      await client.query('commit');
      return this.getRun(runId);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async resumeRun(runId: string): Promise<ControlPlaneRunRecord | undefined> {
    const locator = await this.getRunLocator(runId);
    if (!locator?.tenant_id) {
      return undefined;
    }

    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const tenantSchema = await this.ensureTenantSchema(locator.tenant_id, client);
      const runsTable = this.tableName(tenantSchema, 'runs');
      const runItemsTable = this.tableName(tenantSchema, 'run_items');
      const runResult = await client.query<RunProjectionRow>(
        `select run_id, tenant_id, project_id, name, mode, status, started_at, finished_at, last_event_id, created_at, updated_at
         from ${runsTable}
         where run_id = $1
         limit 1
         for update`,
        [runId],
      );
      if (runResult.rows.length === 0) {
        await client.query('rollback');
        return undefined;
      }

      await client.query(
        `update ${runItemsTable}
         set control_state = 'active',
             control_reason = null,
             updated_at = now()
         where run_id = $1
           and control_state in ('pause_requested', 'paused')`,
        [runId],
      );
      await client.query(
        `update ${runsTable}
         set status = case
               when status = 'canceling' then status
               else status
             end,
             updated_at = now()
         where run_id = $1`,
        [runId],
      );

      await client.query('commit');
      return this.getRun(runId);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async cancelRun(runId: string): Promise<ControlPlaneRunRecord | undefined> {
    const locator = await this.getRunLocator(runId);
    if (!locator?.tenant_id) {
      return undefined;
    }

    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const tenantSchema = await this.ensureTenantSchema(locator.tenant_id, client);
      const runsTable = this.tableName(tenantSchema, 'runs');
      const runItemsTable = this.tableName(tenantSchema, 'run_items');
      const jobLeasesTable = this.tableName(tenantSchema, 'job_leases');
      const runResult = await client.query<RunProjectionRow>(
        `select run_id, tenant_id, project_id, name, mode, status, started_at, finished_at, last_event_id, created_at, updated_at
         from ${runsTable}
         where run_id = $1
         limit 1
         for update`,
        [runId],
      );
      if (runResult.rows.length === 0) {
        await client.query('rollback');
        return undefined;
      }

      await client.query(
        `update ${runItemsTable}
         set status = case when status = 'pending' then 'canceled' else status end,
             finished_at = case when status = 'pending' then now() else finished_at end,
             control_state = case
               when status in ('passed', 'failed', 'canceled') then 'active'
               when status = 'pending' then 'active'
               else 'cancel_requested'
             end,
             control_reason = case
               when status in ('passed', 'failed', 'canceled') then control_reason
               when status = 'pending' then null
               else 'run canceled by control plane'
             end,
             assigned_agent_id = case when status = 'pending' then null else assigned_agent_id end,
             lease_token = case when status = 'pending' then null else lease_token end,
             updated_at = now()
         where run_id = $1`,
        [runId],
      );

      const pendingLeaseTokens = await client.query<{ lease_token: string }>(
        `select lease_token
         from ${runItemsTable}
         where run_id = $1
           and status = 'canceled'
           and lease_token is not null`,
        [runId],
      );
      if (pendingLeaseTokens.rows.length > 0) {
        await client.query(
          `update ${jobLeasesTable}
           set status = 'canceled',
               released_at = now(),
               heartbeat_at = now()
           where lease_token = any($1::text[])
             and released_at is null`,
          [pendingLeaseTokens.rows.map((row) => row.lease_token)],
        );
      }

      const activeRemaining = await client.query<{ active_count: number }>(
        `select count(*)::int as active_count
         from ${runItemsTable}
         where run_id = $1
           and status not in ('passed', 'failed', 'canceled')`,
        [runId],
      );
      const nextRunStatus = (activeRemaining.rows[0]?.active_count ?? 0) > 0 ? 'canceling' : 'canceled';
      await client.query(
        `update ${runsTable}
         set status = $2,
             finished_at = case when $2 = 'canceled' then coalesce(finished_at, now()) else finished_at end,
             updated_at = now()
         where run_id = $1`,
        [runId, nextRunStatus],
      );

      await client.query('commit');
      return this.getRun(runId);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async recordRunnerEvent(envelope: RunnerResultEnvelope): Promise<RecordRunnerEventResult> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const tenantSchema = await this.ensureTenantSchema(envelope.tenant_id, client);
      const runnerEventsTable = this.tableName(tenantSchema, 'control_plane_runner_events');
      const event = toRunnerEventFields(envelope);
      try {
        await client.query(
          `insert into ${runnerEventsTable} (
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
        await this.upsertRunLocator(client, event.runId, event.tenantId, event.projectId);
        await this.upsertRunItemLocator(client, {
          runItemId: event.runItemId,
          runId: event.runId,
          jobId: event.jobId,
          tenantId: event.tenantId,
          projectId: event.projectId,
        });
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
        await this.insertArtifactRecords(client, envelope.payload.artifacts ?? [], {
          tenantId: envelope.tenant_id,
          projectId: envelope.project_id,
          runId: envelope.payload.run_id,
          runItemId: envelope.payload.run_item_id,
          jobId: envelope.payload.job_id,
          stepEventId: envelope.event_id,
        });
      }
      if (isJobResultEnvelope(envelope)) {
        await this.insertArtifactRecords(client, envelope.payload.artifacts ?? [], {
          tenantId: envelope.tenant_id,
          projectId: envelope.project_id,
          runId: envelope.payload.run_id,
          runItemId: envelope.payload.run_item_id,
          jobId: envelope.payload.job_id,
          stepEventId: null,
        });
        await this.releaseLeaseForCompletedJob(client, envelope);
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
    const locator = await this.getRunItemLocatorByJobId(jobId);
    if (!locator?.tenant_id) {
      return [];
    }

    const runnerEventsTable = this.tableName(locator.tenant_id, 'control_plane_runner_events');
    const result = await this.pool.query<RunnerEventRow>(
      `select job_id, event_id, envelope_json
       from ${runnerEventsTable}
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

  async enqueueStepDecision(
    jobId: string,
    sourceStepId: string,
    decision: StepControlResponse,
    context?: { tenantId?: string; runId?: string; runItemId?: string },
  ): Promise<void> {
    const related = await this.getRunItemLocatorByJobId(jobId);
    const contextualRunItem = !related && context?.runItemId
      ? await this.getRunItemLocatorByRunItemId(context.runItemId)
      : undefined;
    const contextualRun = !related && context?.runId
      ? await this.getRunLocator(context.runId)
      : undefined;
    const tenantId = related?.tenant_id
      ?? contextualRunItem?.tenant_id
      ?? contextualRun?.tenant_id
      ?? context?.tenantId;
    if (tenantId) {
      await this.ensureTenantSchema(tenantId);
    }
    const stepDecisionsTable = tenantId
      ? this.tableName(tenantId, 'step_decisions')
      : 'step_decisions';
    const runId = related?.run_id
      ?? contextualRunItem?.run_id
      ?? (contextualRun?.tenant_id === tenantId ? context?.runId ?? null : null);
    const runItemId = related?.run_item_id
      ?? contextualRunItem?.run_item_id
      ?? null;

    await this.pool.query(
      `insert into ${stepDecisionsTable} (
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
        runId,
        runItemId,
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
      const locator = await this.getRunItemLocatorByJobId(jobId, client);
      const tenantTable = locator?.tenant_id ? this.tableName(locator.tenant_id, 'step_decisions') : null;
      const decisionResult = tenantTable
        ? await client.query<StepDecisionRow>(
          `select decision_id, action, reason, replacement_step_json, resume_after_ms
           from ${tenantTable}
           where job_id = $1
             and source_step_id = $2
             and consumed_at is null
           order by decision_id asc
           limit 1`,
          [jobId, sourceStepId],
        )
        : { rows: [] };
      const tableName = decisionResult.rows.length > 0 ? tenantTable : 'step_decisions';
      const fallbackDecisionResult = decisionResult.rows.length > 0
        ? decisionResult
        : await client.query<StepDecisionRow>(
        `select decision_id, action, reason, replacement_step_json, resume_after_ms
         from step_decisions
         where job_id = $1
           and source_step_id = $2
           and consumed_at is null
         order by decision_id asc
         limit 1`,
        [jobId, sourceStepId],
      );

      if (fallbackDecisionResult.rows.length === 0) {
        await client.query('rollback');
        return undefined;
      }

      const decisionRow = fallbackDecisionResult.rows[0];
      const updateResult = await client.query(
        `update ${tableName}
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

  async resolveStepControlDecision(
    jobId: string,
    _runId: string,
    runItemId: string,
    sourceStepId: string,
    context?: { tenantId?: string },
  ): Promise<StepControlResponse | undefined> {
    const locator = await this.getRunItemLocatorByRunItemId(runItemId);
    const tenantId = locator?.tenant_id ?? context?.tenantId;
    if (!tenantId) {
      return this.dequeueStepDecision(jobId, sourceStepId);
    }

    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await this.ensureTenantSchema(tenantId, client);
      const runItemsTable = this.tableName(tenantId, 'run_items');
      const stepDecisionsTable = this.tableName(tenantId, 'step_decisions');
      const runItemResult = await client.query<{ control_state: string | null; control_reason: string | null }>(
        `select control_state, control_reason
         from ${runItemsTable}
         where run_item_id = $1
           and job_id = $2
         limit 1
         for update`,
        [runItemId, jobId],
      );
      const controlState = runItemResult.rows[0]?.control_state ?? 'active';
      const controlReason = runItemResult.rows[0]?.control_reason ?? null;

      if (controlState === 'cancel_requested') {
        await client.query('commit');
        return {
          action: 'cancel',
          reason: controlReason ?? 'run canceled by control plane',
        };
      }

      if (controlState === 'pause_requested' || controlState === 'paused') {
        if (controlState === 'pause_requested') {
          await client.query(
            `update ${runItemsTable}
             set control_state = 'paused',
                 updated_at = now()
             where run_item_id = $1`,
            [runItemId],
          );
        }
        await client.query('commit');
        return {
          action: 'pause',
          reason: controlReason ?? 'run paused by control plane',
          resume_after_ms: 250,
        };
      }

      const decisionResult = await client.query<StepDecisionRow>(
        `select decision_id, action, reason, replacement_step_json, resume_after_ms
         from ${stepDecisionsTable}
         where job_id = $1
           and source_step_id = $2
           and consumed_at is null
         order by decision_id asc
         limit 1`,
        [jobId, sourceStepId],
      );
      const tableName = decisionResult.rows.length > 0 ? stepDecisionsTable : 'step_decisions';
      const selectedDecisionResult = decisionResult.rows.length > 0
        ? decisionResult
        : await client.query<StepDecisionRow>(
          `select decision_id, action, reason, replacement_step_json, resume_after_ms
           from step_decisions
           where job_id = $1
             and source_step_id = $2
             and consumed_at is null
           order by decision_id asc
           limit 1`,
          [jobId, sourceStepId],
        );

      if (selectedDecisionResult.rows.length === 0) {
        await client.query('commit');
        return undefined;
      }

      const decisionRow = selectedDecisionResult.rows[0];
      const updateResult = await client.query(
        `update ${tableName}
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
    const locator = await this.getRunLocator(runId);
    if (!locator?.tenant_id) {
      return undefined;
    }

    const runsTable = this.tableName(locator.tenant_id, 'runs');
    const result = await this.pool.query<RunProjectionRow>(
      `select run_id, tenant_id, project_id, name, mode, status, started_at, finished_at, last_event_id, created_at, updated_at
       from ${runsTable}
       where run_id = $1
       limit 1`,
      [runId],
    );
    return result.rows[0] ? mapRunProjection(result.rows[0]) : undefined;
  }

  async listRuns(query: ControlPlaneListRunsQuery): Promise<ControlPlanePage<ControlPlaneRunRecord>> {
    const tenantSchema = await this.resolveTenantSchema(query.tenantId);
    if (!tenantSchema) {
      return { items: [] };
    }

    const cursor = decodeCursor(query.cursor);
    const values: unknown[] = [query.tenantId, query.projectId];
    const runsTable = this.tableName(tenantSchema, 'runs');
    let sql = `select run_id, tenant_id, project_id, name, mode, status, started_at, finished_at, last_event_id, created_at, updated_at
       from ${runsTable}
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
    const locator = await this.getRunItemLocatorByRunItemId(runItemId);
    if (!locator?.tenant_id) {
      return undefined;
    }

    const runItemsTable = this.tableName(locator.tenant_id, 'run_items');
    const result = await this.pool.query<RunItemProjectionRow>(
      `select run_item_id, run_id, job_id, tenant_id, project_id, attempt_no, status, job_kind,
              required_capabilities_json, assigned_agent_id, lease_token, control_state, control_reason,
              started_at, finished_at, last_event_id, created_at, updated_at
       from ${runItemsTable}
       where run_item_id = $1
       limit 1`,
      [runItemId],
    );
    return result.rows[0] ? mapRunItemProjection(result.rows[0]) : undefined;
  }

  async listRunItems(query: ControlPlaneListRunItemsQuery): Promise<ControlPlanePage<ControlPlaneRunItemRecord>> {
    const locator = await this.getRunLocator(query.runId);
    if (!locator?.tenant_id) {
      return { items: [] };
    }

    const cursor = decodeCursor(query.cursor);
    const values: unknown[] = [query.runId];
    const runItemsTable = this.tableName(locator.tenant_id, 'run_items');
    let sql = `select run_item_id, run_id, job_id, tenant_id, project_id, attempt_no, status, job_kind,
                      required_capabilities_json, assigned_agent_id, lease_token, control_state, control_reason,
                      started_at, finished_at, last_event_id, created_at, updated_at
       from ${runItemsTable}
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
    const locator = await this.getRunLocator(runId);
    if (!locator?.tenant_id) {
      return { items: [] };
    }

    const cursor = decodeCursor(query.cursor);
    const values: unknown[] = [runId];
    const stepEventsTable = this.tableName(locator.tenant_id, 'step_events');
    let sql = `select event_id, run_id, run_item_id, job_id, tenant_id, project_id, attempt_no, compiled_step_id, source_step_id, status,
                      started_at, finished_at, duration_ms, error_code, error_message, artifacts_json, extracted_variables_json, received_at
       from ${stepEventsTable}
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
    const locator = await this.getRunItemLocatorByRunItemId(runItemId);
    if (!locator?.tenant_id) {
      return { items: [] };
    }

    const cursor = decodeCursor(query.cursor);
    const values: unknown[] = [runItemId];
    const stepEventsTable = this.tableName(locator.tenant_id, 'step_events');
    let sql = `select event_id, run_id, run_item_id, job_id, tenant_id, project_id, attempt_no, compiled_step_id, source_step_id, status,
                      started_at, finished_at, duration_ms, error_code, error_message, artifacts_json, extracted_variables_json, received_at
       from ${stepEventsTable}
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

  async listArtifactsByRun(runId: string, query: ControlPlaneListArtifactsQuery): Promise<ControlPlanePage<ControlPlaneArtifactRecord>> {
    const locator = await this.getRunLocator(runId);
    if (!locator?.tenant_id) {
      return { items: [] };
    }

    const cursor = decodeCursor(query.cursor);
    const values: unknown[] = [runId];
    const artifactsTable = this.tableName(locator.tenant_id, 'artifacts');
    let sql = `select artifact_id, tenant_id, project_id, run_id, run_item_id, step_event_id, job_id,
                      artifact_type, storage_uri, content_type, size_bytes, sha256, metadata_json, retention_expires_at, created_at
       from ${artifactsTable}
       where run_id = $1`;

    if (cursor) {
      values.push(cursor.primary, cursor.secondary);
      sql += `
         and (created_at, artifact_id) < ($2::timestamptz, $3)`;
    }

    values.push(query.limit + 1);
    sql += `
       order by created_at desc, artifact_id desc
       limit $${values.length}`;

    const result = await this.pool.query<ArtifactRow>(sql, values);
    return toPage(result.rows.map(mapArtifact), query.limit, (artifact) => ({
      primary: artifact.createdAt,
      secondary: artifact.artifactId,
    }));
  }

  async listArtifactsByRunItem(runItemId: string, query: ControlPlaneListArtifactsQuery): Promise<ControlPlanePage<ControlPlaneArtifactRecord>> {
    const locator = await this.getRunItemLocatorByRunItemId(runItemId);
    if (!locator?.tenant_id) {
      return { items: [] };
    }

    const cursor = decodeCursor(query.cursor);
    const values: unknown[] = [runItemId];
    const artifactsTable = this.tableName(locator.tenant_id, 'artifacts');
    let sql = `select artifact_id, tenant_id, project_id, run_id, run_item_id, step_event_id, job_id,
                      artifact_type, storage_uri, content_type, size_bytes, sha256, metadata_json, retention_expires_at, created_at
       from ${artifactsTable}
       where run_item_id = $1`;

    if (cursor) {
      values.push(cursor.primary, cursor.secondary);
      sql += `
         and (created_at, artifact_id) < ($2::timestamptz, $3)`;
    }

    values.push(query.limit + 1);
    sql += `
       order by created_at desc, artifact_id desc
       limit $${values.length}`;

    const result = await this.pool.query<ArtifactRow>(sql, values);
    return toPage(result.rows.map(mapArtifact), query.limit, (artifact) => ({
      primary: artifact.createdAt,
      secondary: artifact.artifactId,
    }));
  }

  async getArtifact(artifactId: string): Promise<ControlPlaneArtifactRecord | undefined> {
    const locator = await this.getArtifactLocator(artifactId);
    if (!locator?.tenant_id) {
      return undefined;
    }

    const artifactsTable = this.tableName(locator.tenant_id, 'artifacts');
    const result = await this.pool.query<ArtifactRow>(
      `select artifact_id, tenant_id, project_id, run_id, run_item_id, step_event_id, job_id,
              artifact_type, storage_uri, content_type, size_bytes, sha256, metadata_json, retention_expires_at, created_at
       from ${artifactsTable}
       where artifact_id = $1
       limit 1`,
      [artifactId],
    );
    const row = result.rows[0];
    return row ? mapArtifact(row) : undefined;
  }

  async listExpiredArtifacts(query: ControlPlaneListExpiredArtifactsQuery): Promise<ControlPlaneArtifactRecord[]> {
    const expiresBefore = query.expiresBefore ?? new Date().toISOString();
    const tenantSchemas = await this.listTenantSchemas();
    const items: ControlPlaneArtifactRecord[] = [];

    for (const tenantId of tenantSchemas) {
      const artifactsTable = this.tableName(tenantId, 'artifacts');
      const result = await this.pool.query<ArtifactRow>(
        `select artifact_id, tenant_id, project_id, run_id, run_item_id, step_event_id, job_id,
                artifact_type, storage_uri, content_type, size_bytes, sha256, metadata_json, retention_expires_at, created_at
         from ${artifactsTable}
         where retention_expires_at is not null
           and retention_expires_at <= $1
         order by retention_expires_at asc, artifact_id asc
         limit $2`,
        [expiresBefore, query.limit],
      );
      items.push(...result.rows.map(mapArtifact));
      if (items.length >= query.limit) {
        break;
      }
    }

    return items
      .sort((left, right) => (left.retentionExpiresAt ?? '').localeCompare(right.retentionExpiresAt ?? '') || left.artifactId.localeCompare(right.artifactId))
      .slice(0, query.limit);
  }

  async deleteArtifacts(artifactIds: string[]): Promise<number> {
    if (artifactIds.length === 0) {
      return 0;
    }

    const locators = await Promise.all(artifactIds.map((artifactId) => this.getArtifactLocator(artifactId)));
    const grouped = new Map<string, string[]>();
    for (let index = 0; index < artifactIds.length; index += 1) {
      const locator = locators[index];
      if (!locator?.tenant_id) {
        continue;
      }
      const ids = grouped.get(locator.tenant_id) ?? [];
      ids.push(artifactIds[index]);
      grouped.set(locator.tenant_id, ids);
    }

    let deletedCount = 0;
    for (const [tenantId, ids] of grouped.entries()) {
      const artifactsTable = this.tableName(tenantId, 'artifacts');
      const result = await this.pool.query(
        `delete from ${artifactsTable}
         where artifact_id = any($1::text[])`,
        [ids],
      );
      deletedCount += result.rowCount ?? 0;
    }

    if (deletedCount > 0) {
      await this.pool.query(
        `delete from artifact_locators
         where artifact_id = any($1::text[])`,
        [artifactIds],
      );
    }
    return deletedCount;
  }

  async snapshot(): Promise<ControlPlaneStateSnapshot> {
    const eventsByJob: ControlPlaneStateSnapshot['eventsByJob'] = {};
    const pendingDecisionsByJob: ControlPlaneStateSnapshot['pendingDecisionsByJob'] = {};
    const tenantSchemas = await this.listTenantSchemas();
    const receivedEventIds: string[] = [];
    const publicDecisionsResult = await this.pool.query<SnapshotDecisionRow>(
      `select job_id, source_step_id, action, reason, replacement_step_json, resume_after_ms
       from step_decisions
       where consumed_at is null
       order by decision_id asc`,
    );

    for (const tenantId of tenantSchemas) {
      const eventsTable = this.tableName(tenantId, 'control_plane_runner_events');
      const decisionsTable = this.tableName(tenantId, 'step_decisions');
      const [eventsResult, decisionsResult] = await Promise.all([
        this.pool.query<RunnerEventRow>(
          `select job_id, event_id, envelope_json
           from ${eventsTable}
           order by received_at asc, event_id asc`,
        ),
        this.pool.query<SnapshotDecisionRow>(
          `select job_id, source_step_id, action, reason, replacement_step_json, resume_after_ms
           from ${decisionsTable}
           where consumed_at is null
           order by decision_id asc`,
        ),
      ]);

      for (const row of eventsResult.rows) {
        const envelope = parseJsonColumn<RunnerResultEnvelope>(row.envelope_json) as RunnerResultEnvelope;
        const events = eventsByJob[row.job_id] ?? [];
        events.push({
          receivedAt: envelope.occurred_at,
          envelope,
        });
        eventsByJob[row.job_id] = events;
        receivedEventIds.push(row.event_id);
      }

      for (const row of decisionsResult.rows) {
        const byStep = pendingDecisionsByJob[row.job_id] ?? {};
        const queue = byStep[row.source_step_id] ?? [];
        queue.push(buildStepDecision(row));
        byStep[row.source_step_id] = queue;
        pendingDecisionsByJob[row.job_id] = byStep;
      }
    }

    for (const row of publicDecisionsResult.rows) {
      const byStep = pendingDecisionsByJob[row.job_id] ?? {};
      const queue = byStep[row.source_step_id] ?? [];
      queue.push(buildStepDecision(row));
      byStep[row.source_step_id] = queue;
      pendingDecisionsByJob[row.job_id] = byStep;
    }

    return {
      eventsByJob,
      pendingDecisionsByJob,
      receivedEventIds,
    };
  }

  async close(): Promise<void> {
    if (this.ownPool) {
      await this.pool.end();
    }
  }

  private tableName(tenantId: string, tableName: string): string {
    return `${quotePostgresIdentifier(tenantId)}.${quotePostgresIdentifier(tableName)}`;
  }

  private async listTenantSchemas(): Promise<string[]> {
    const result = await this.pool.query<TenantSchemaRow>(
      `select tenant_id, schema_name
       from tenant_schemas
       order by tenant_id asc`,
    );
    for (const row of result.rows) {
      this.ensuredTenantSchemas.add(row.tenant_id);
    }
    return result.rows.map((row) => row.tenant_id);
  }

  private async resolveTenantSchema(tenantId: string, executor: SqlPoolLike | SqlPoolClientLike = this.pool): Promise<string | undefined> {
    if (this.ensuredTenantSchemas.has(tenantId)) {
      return tenantId;
    }

    const result = await executor.query<TenantSchemaRow>(
      `select tenant_id, schema_name
       from tenant_schemas
       where tenant_id = $1
       limit 1`,
      [tenantId],
    );
    if (result.rows.length === 0) {
      return undefined;
    }

    this.ensuredTenantSchemas.add(tenantId);
    return result.rows[0].schema_name;
  }

  private async ensureTenantSchema(tenantId: string, executor: SqlPoolLike | SqlPoolClientLike = this.pool): Promise<string> {
    const existing = await this.resolveTenantSchema(tenantId, executor);
    if (existing) {
      return existing;
    }

    await executor.query(
      `insert into tenant_schemas (tenant_id, schema_name)
       values ($1, $2)
       on conflict (tenant_id) do update set
         schema_name = excluded.schema_name,
         updated_at = now()`,
      [tenantId, tenantId],
    );
    await executor.query(buildTenantBusinessSchemaSql(tenantId));
    this.ensuredTenantSchemas.add(tenantId);
    return tenantId;
  }

  private async getRunLocator(runId: string, executor: SqlPoolLike | SqlPoolClientLike = this.pool): Promise<EntityLocatorRow | undefined> {
    const result = await executor.query<EntityLocatorRow>(
      `select tenant_id, project_id
       from run_locators
       where run_id = $1
       limit 1`,
      [runId],
    );
    return result.rows[0];
  }

  private async getRunItemLocatorByRunItemId(
    runItemId: string,
    executor: SqlPoolLike | SqlPoolClientLike = this.pool,
  ): Promise<EntityLocatorRow | undefined> {
    const result = await executor.query<EntityLocatorRow>(
      `select tenant_id, project_id, run_id, run_item_id, job_id
       from run_item_locators
       where run_item_id = $1
       limit 1`,
      [runItemId],
    );
    return result.rows[0];
  }

  private async getRunItemLocatorByJobId(
    jobId: string,
    executor: SqlPoolLike | SqlPoolClientLike = this.pool,
  ): Promise<EntityLocatorRow | undefined> {
    const result = await executor.query<EntityLocatorRow>(
      `select tenant_id, project_id, run_id, run_item_id, job_id
       from run_item_locators
       where job_id = $1
       limit 1`,
      [jobId],
    );
    return result.rows[0];
  }

  private async getArtifactLocator(
    artifactId: string,
    executor: SqlPoolLike | SqlPoolClientLike = this.pool,
  ): Promise<EntityLocatorRow | undefined> {
    const result = await executor.query<EntityLocatorRow>(
      `select tenant_id, project_id, run_id, run_item_id
       from artifact_locators
       where artifact_id = $1
       limit 1`,
      [artifactId],
    );
    return result.rows[0];
  }

  private async getAgentLocator(
    agentId: string,
    executor: SqlPoolLike | SqlPoolClientLike = this.pool,
  ): Promise<EntityLocatorRow | undefined> {
    const result = await executor.query<EntityLocatorRow>(
      `select tenant_id, project_id, agent_id
       from agent_locators
       where agent_id = $1
       limit 1`,
      [agentId],
    );
    return result.rows[0];
  }

  private async getLeaseLocator(
    leaseToken: string,
    executor: SqlPoolLike | SqlPoolClientLike = this.pool,
  ): Promise<EntityLocatorRow | undefined> {
    const result = await executor.query<EntityLocatorRow>(
      `select tenant_id, run_id, run_item_id, job_id, agent_id
       from lease_locators
       where lease_token = $1
       limit 1`,
      [leaseToken],
    );
    return result.rows[0];
  }

  private async upsertRunLocator(
    executor: SqlPoolLike | SqlPoolClientLike,
    runId: string,
    tenantId: string,
    projectId: string,
  ): Promise<void> {
    await executor.query(
      `insert into run_locators (run_id, tenant_id, project_id)
       values ($1, $2, $3)
       on conflict (run_id) do update set
         tenant_id = excluded.tenant_id,
         project_id = excluded.project_id,
         updated_at = now()`,
      [runId, tenantId, projectId],
    );
  }

  private async upsertRunItemLocator(
    executor: SqlPoolLike | SqlPoolClientLike,
    input: { runItemId: string; runId: string; jobId: string; tenantId: string; projectId: string },
  ): Promise<void> {
    await executor.query(
      `insert into run_item_locators (run_item_id, run_id, job_id, tenant_id, project_id)
       values ($1, $2, $3, $4, $5)
       on conflict (run_item_id) do update set
         run_id = excluded.run_id,
         job_id = excluded.job_id,
         tenant_id = excluded.tenant_id,
         project_id = excluded.project_id,
         updated_at = now()`,
      [input.runItemId, input.runId, input.jobId, input.tenantId, input.projectId],
    );
  }

  private async upsertAgentLocator(
    executor: SqlPoolLike | SqlPoolClientLike,
    agentId: string,
    tenantId: string,
    projectId: string | null,
  ): Promise<void> {
    await executor.query(
      `insert into agent_locators (agent_id, tenant_id, project_id)
       values ($1, $2, $3)
       on conflict (agent_id) do update set
         tenant_id = excluded.tenant_id,
         project_id = excluded.project_id,
         updated_at = now()`,
      [agentId, tenantId, projectId],
    );
  }

  private async upsertLeaseLocator(
    executor: SqlPoolLike | SqlPoolClientLike,
    input: { leaseToken: string; jobId: string; runId: string | null; runItemId: string | null; agentId: string; tenantId: string },
  ): Promise<void> {
    await executor.query(
      `insert into lease_locators (lease_token, job_id, run_id, run_item_id, agent_id, tenant_id)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (lease_token) do update set
         job_id = excluded.job_id,
         run_id = excluded.run_id,
         run_item_id = excluded.run_item_id,
         agent_id = excluded.agent_id,
         tenant_id = excluded.tenant_id,
         updated_at = now()`,
      [input.leaseToken, input.jobId, input.runId, input.runItemId, input.agentId, input.tenantId],
    );
  }

  private async upsertArtifactLocator(
    executor: SqlPoolLike | SqlPoolClientLike,
    input: { artifactId: string; runId: string | null; runItemId: string | null; tenantId: string; projectId: string },
  ): Promise<void> {
    await executor.query(
      `insert into artifact_locators (artifact_id, run_id, run_item_id, tenant_id, project_id)
       values ($1, $2, $3, $4, $5)
       on conflict (artifact_id) do update set
         run_id = excluded.run_id,
         run_item_id = excluded.run_item_id,
         tenant_id = excluded.tenant_id,
         project_id = excluded.project_id,
         updated_at = now()`,
      [input.artifactId, input.runId, input.runItemId, input.tenantId, input.projectId],
    );
  }

  private async reclaimExpiredLeases(client: SqlPoolClientLike): Promise<void> {
    const tenantIds = await this.listTenantSchemas();
    for (const tenantId of tenantIds) {
      const jobLeasesTable = this.tableName(tenantId, 'job_leases');
      const runItemsTable = this.tableName(tenantId, 'run_items');
      const runsTable = this.tableName(tenantId, 'runs');
      const expiredResult = await client.query<ExpiredLeaseRow>(
        `update ${jobLeasesTable}
         set status = 'expired',
             released_at = now()
         where released_at is null
           and expires_at < now()
         returning run_id, run_item_id`,
      );

      const expiredRunItemIds = expiredResult.rows
        .map((row) => row.run_item_id)
        .filter((value): value is string => Boolean(value));
      if (expiredRunItemIds.length > 0) {
        await client.query(
          `update ${runItemsTable}
           set status = 'pending',
               assigned_agent_id = null,
               lease_token = null,
               updated_at = now()
           where run_item_id = any($1::text[])
             and status in ('dispatched', 'running')`,
          [expiredRunItemIds],
        );
      }

      const expiredRunIds = Array.from(new Set(expiredResult.rows
        .map((row) => row.run_id)
        .filter((value): value is string => Boolean(value))));
      if (expiredRunIds.length > 0) {
        await client.query(
          `update ${runsTable}
           set status = 'queued',
               updated_at = now()
           where run_id = any($1::text[])
             and status = 'running'
             and exists (
               select 1
               from ${runItemsTable}
               where ${runItemsTable}.run_id = ${runsTable}.run_id
                 and ${runItemsTable}.status = 'pending'
             )`,
          [expiredRunIds],
        );
      }
    }
  }

  private async upsertRunProjection(client: SqlPoolClientLike, envelope: RunnerResultEnvelope): Promise<void> {
    const timestamps = toProjectionTimestamps(envelope);
    const runsTable = this.tableName(envelope.tenant_id, 'runs');
    await client.query(
      upsertProjectionStatusSql(runsTable, 'run_id'),
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
    await this.upsertRunLocator(client, envelope.payload.run_id, envelope.tenant_id, envelope.project_id);
  }

  private async upsertRunItemProjection(client: SqlPoolClientLike, envelope: RunnerResultEnvelope): Promise<void> {
    const timestamps = toProjectionTimestamps(envelope);
    const runItemsTable = this.tableName(envelope.tenant_id, 'run_items');
    await client.query(
      `insert into ${runItemsTable} (
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
         started_at = coalesce(${runItemsTable}.started_at, excluded.started_at),
         finished_at = coalesce(excluded.finished_at, ${runItemsTable}.finished_at),
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
    await this.upsertRunItemLocator(client, {
      runItemId: envelope.payload.run_item_id,
      runId: envelope.payload.run_id,
      jobId: envelope.payload.job_id,
      tenantId: envelope.tenant_id,
      projectId: envelope.project_id,
    });
  }

  private async insertStepEventProjection(client: SqlPoolClientLike, envelope: StepResultReportedEnvelope): Promise<void> {
    const stepEvent = buildStepEventValues(envelope);
    const stepEventsTable = this.tableName(envelope.tenant_id, 'step_events');
    await client.query(
      `insert into ${stepEventsTable} (
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

  private async insertArtifactRecords(
    client: SqlPoolClientLike,
    artifacts: unknown[],
    context: {
      tenantId: string;
      projectId: string;
      runId: string;
      runItemId: string;
      jobId: string;
      stepEventId: string | null;
    },
  ): Promise<void> {
    const artifactsTable = this.tableName(context.tenantId, 'artifacts');
    for (const artifact of artifacts) {
      if (!isArtifactReference(artifact)) {
        continue;
      }

      const artifactId = artifact.artifactId ?? randomUUID();

      await client.query(
        `insert into ${artifactsTable} (
           artifact_id,
           tenant_id,
           project_id,
           run_id,
           run_item_id,
           step_event_id,
           job_id,
           artifact_type,
           storage_uri,
           content_type,
           size_bytes,
           sha256,
           metadata_json,
           retention_expires_at
         ) values (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14
        )
         on conflict (artifact_id) do update set
           storage_uri = excluded.storage_uri,
           content_type = excluded.content_type,
           size_bytes = excluded.size_bytes,
           sha256 = excluded.sha256,
           metadata_json = excluded.metadata_json,
           retention_expires_at = excluded.retention_expires_at`,
        [
          artifactId,
          context.tenantId,
          context.projectId,
          context.runId,
          context.runItemId,
          context.stepEventId,
          context.jobId,
          artifact.kind,
          artifact.uri,
          artifact.contentType ?? null,
          artifact.sizeBytes ?? null,
          artifact.sha256 ?? null,
          JSON.stringify(artifact.metadata ?? {}),
          resolveArtifactRetentionExpiresAt(artifact),
        ],
      );
      await this.upsertArtifactLocator(client, {
        artifactId,
        runId: context.runId,
        runItemId: context.runItemId,
        tenantId: context.tenantId,
        projectId: context.projectId,
      });
    }
  }

  private async linkStepDecisions(client: SqlPoolClientLike, envelope: RunnerResultEnvelope): Promise<void> {
    const stepDecisionsTable = this.tableName(envelope.tenant_id, 'step_decisions');
      await client.query(
        `update ${stepDecisionsTable}
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

  private async releaseLeaseForCompletedJob(client: SqlPoolClientLike, envelope: ResultReportedEnvelope): Promise<void> {
    const jobLeasesTable = this.tableName(envelope.tenant_id, 'job_leases');
    const runItemsTable = this.tableName(envelope.tenant_id, 'run_items');
    await client.query(
      `update ${jobLeasesTable}
       set status = case
         when $2 = 'passed' then 'completed'
         when $2 = 'failed' then 'failed'
         else 'canceled'
       end,
           released_at = coalesce(released_at, now()),
           heartbeat_at = now()
       where job_id = $1
         and released_at is null`,
      [
        envelope.payload.job_id,
        envelope.payload.status,
      ],
    );
    await client.query(
      `update ${runItemsTable}
       set assigned_agent_id = null,
           lease_token = null,
           control_state = 'active',
           control_reason = null,
           updated_at = now()
       where job_id = $1`,
      [envelope.payload.job_id],
    );
  }
}
