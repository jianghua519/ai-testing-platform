import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';

import type {
  CreateExplorationInput,
  CreateRunEvaluationInput,
  CreateSelfHealAttemptInput,
  ExplorationArtifact,
  ExplorationSession,
  RunEvaluation,
  SelfHealAttempt,
} from '../types.js';
import type { AiOrchestratorConfig } from './config.js';
import { runAiOrchestratorPostgresMigrations } from './postgres-migrations.js';
import { buildAssistantTenantSchemaSql, quotePostgresIdentifier } from './postgres-schema.js';
import type { OrchestrationStore, UpdateExplorationInput, UpdateSelfHealAttemptInput } from './orchestration-store.js';
import type { SqlPoolClientLike, SqlPoolLike } from './postgres-thread-store.js';

interface ExplorationLocatorRow {
  tenant_id: string;
  project_id: string;
}

interface SelfHealLocatorRow {
  tenant_id: string;
  project_id: string;
}

interface RunEvaluationLocatorRow {
  tenant_id: string;
  project_id: string;
}

interface ExplorationSessionRow {
  exploration_id: string;
  tenant_id: string;
  project_id: string;
  thread_id: string | null;
  user_id: string | null;
  status: ExplorationSession['status'];
  execution_mode: ExplorationSession['executionMode'];
  name: string | null;
  instruction: string;
  start_url: string;
  recording_id: string | null;
  output_dir: string | null;
  summary: string | null;
  last_snapshot_markdown: string | null;
  sample_dataset_json: unknown;
  artifacts_json: unknown;
  created_test_case_id: string | null;
  created_test_case_version_id: string | null;
  default_dataset_row_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SelfHealAttemptRow {
  self_heal_attempt_id: string;
  tenant_id: string;
  project_id: string;
  run_id: string;
  run_item_id: string;
  failed_step_event_id: string | null;
  source_step_id: string;
  failure_category: string;
  strategy_summary: string;
  explanation: string | null;
  override_json: unknown;
  replay_run_id: string | null;
  replay_run_status: string | null;
  derived_test_case_version_id: string | null;
  status: SelfHealAttempt['status'];
  created_at: string;
  updated_at: string;
}

interface RunEvaluationRow {
  run_evaluation_id: string;
  tenant_id: string;
  project_id: string;
  run_id: string;
  run_item_id: string;
  verdict: RunEvaluation['verdict'];
  deterministic_summary_json: unknown;
  explanation: string;
  evidence_json: unknown;
  linked_artifact_ids_json: unknown;
  self_heal_attempt_id: string | null;
  created_at: string;
  updated_at: string;
}

const parseObject = (value: unknown): Record<string, unknown> => {
  if (typeof value === 'string') {
    try {
      return parseObject(JSON.parse(value));
    } catch {
      return {};
    }
  }

  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
};

const parseArray = <T>(value: unknown): T[] => {
  if (typeof value === 'string') {
    try {
      return parseArray<T>(JSON.parse(value));
    } catch {
      return [];
    }
  }

  return Array.isArray(value) ? value as T[] : [];
};

const toTimestamp = (value: string | Date): number => {
  const normalized = value instanceof Date ? value.toISOString() : String(value);
  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const toExploration = (row: ExplorationSessionRow): ExplorationSession => ({
  id: row.exploration_id,
  threadId: row.thread_id,
  tenantId: row.tenant_id,
  projectId: row.project_id,
  userId: row.user_id,
  status: row.status,
  executionMode: row.execution_mode,
  name: row.name,
  instruction: row.instruction,
  startUrl: row.start_url,
  recordingId: row.recording_id,
  outputDir: row.output_dir,
  summary: row.summary,
  lastSnapshotMarkdown: row.last_snapshot_markdown,
  sampleDataset: parseObject(row.sample_dataset_json),
  artifacts: parseArray<ExplorationArtifact>(row.artifacts_json),
  createdTestCaseId: row.created_test_case_id,
  createdTestCaseVersionId: row.created_test_case_version_id,
  defaultDatasetRowId: row.default_dataset_row_id,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toSelfHealAttempt = (row: SelfHealAttemptRow): SelfHealAttempt => ({
  id: row.self_heal_attempt_id,
  tenantId: row.tenant_id,
  projectId: row.project_id,
  runId: row.run_id,
  runItemId: row.run_item_id,
  failedStepEventId: row.failed_step_event_id,
  sourceStepId: row.source_step_id,
  failureCategory: row.failure_category,
  strategySummary: row.strategy_summary,
  explanation: row.explanation,
  overridePayload: row.override_json == null ? null : parseObject(row.override_json),
  replayRunId: row.replay_run_id,
  replayRunStatus: row.replay_run_status,
  derivedTestCaseVersionId: row.derived_test_case_version_id,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toRunEvaluation = (row: RunEvaluationRow): RunEvaluation => ({
  id: row.run_evaluation_id,
  tenantId: row.tenant_id,
  projectId: row.project_id,
  runId: row.run_id,
  runItemId: row.run_item_id,
  verdict: row.verdict,
  deterministicSummary: parseObject(row.deterministic_summary_json),
  explanation: row.explanation,
  evidence: parseArray<Record<string, unknown>>(row.evidence_json),
  linkedArtifactIds: parseArray<string>(row.linked_artifact_ids_json),
  selfHealAttemptId: row.self_heal_attempt_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class PostgresOrchestrationStore implements OrchestrationStore {
  readonly mode = 'postgres' as const;
  readonly #config: AiOrchestratorConfig;
  readonly #pool: SqlPoolLike;
  readonly #ensuredTenantSchemas = new Set<string>();

  constructor(config: AiOrchestratorConfig) {
    if (!config.databaseUrl) {
      throw new Error('AI_ORCHESTRATOR_DATABASE_URL is required for postgres orchestration store');
    }

    this.#config = config;
    this.#pool = new Pool({
      connectionString: config.databaseUrl,
    });
  }

  async initialize(): Promise<void> {
    if (this.#config.runMigrations) {
      await runAiOrchestratorPostgresMigrations(this.#pool);
    }

    await this.#reconcileExistingTenantSchemas();
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }

  async createExploration(input: CreateExplorationInput): Promise<ExplorationSession> {
    const explorationId = randomUUID();
    const timestamp = new Date().toISOString();
    const tenantId = input.tenantId.trim();
    const projectId = input.projectId.trim();
    const threadId = input.threadId?.trim() || null;
    const userId = input.userId?.trim() || null;
    const name = input.name?.trim() || null;

    const client = await this.#pool.connect();
    try {
      await client.query('begin');
      const tenantSchema = await this.#ensureTenantSchema(tenantId, client);
      const table = this.#tableName(tenantSchema, 'exploration_sessions');
      await client.query(
        `insert into ${table} (
           exploration_id, tenant_id, project_id, thread_id, user_id, status, execution_mode,
           name, instruction, start_url, created_at, updated_at
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          explorationId,
          tenantId,
          projectId,
          threadId,
          userId,
          'draft',
          input.executionMode ?? 'ai',
          name,
          input.instruction.trim(),
          input.startUrl.trim(),
          timestamp,
          timestamp,
        ],
      );
      await this.#upsertExplorationLocator(client, explorationId, tenantId, projectId);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }

    const exploration = await this.getExploration(explorationId);
    if (!exploration) {
      throw new Error(`exploration not found after create: ${explorationId}`);
    }
    return exploration;
  }

  async getExploration(explorationId: string): Promise<ExplorationSession | null> {
    const locator = await this.#getExplorationLocator(explorationId);
    if (!locator) {
      return null;
    }

    const tenantSchema = await this.#ensureTenantSchema(locator.tenant_id);
    const table = this.#tableName(tenantSchema, 'exploration_sessions');
    const result = await this.#pool.query<ExplorationSessionRow>(
      `select exploration_id, tenant_id, project_id, thread_id, user_id, status, execution_mode,
              name, instruction, start_url, recording_id, output_dir, summary, last_snapshot_markdown,
              sample_dataset_json, artifacts_json, created_test_case_id, created_test_case_version_id,
              default_dataset_row_id, started_at, finished_at, created_at, updated_at
         from ${table}
        where exploration_id = $1
        limit 1`,
      [explorationId],
    );
    return result.rows[0] ? toExploration(result.rows[0]) : null;
  }

  async getLatestExplorationForThread(threadId: string): Promise<ExplorationSession | null> {
    const locatorResult = await this.#pool.query<ExplorationLocatorRow & { exploration_id: string }>(
      `select exploration_id, tenant_id, project_id
         from exploration_session_locators
        where exploration_id in (
          select exploration_id
            from (
              select exploration_id, tenant_id
                from exploration_session_locators
            ) locators
        )`,
    ).catch(() => ({ rows: [] }));

    const candidates: ExplorationSession[] = [];
    for (const locator of locatorResult.rows) {
      const tenantSchema = await this.#ensureTenantSchema(locator.tenant_id);
      const table = this.#tableName(tenantSchema, 'exploration_sessions');
      const result = await this.#pool.query<ExplorationSessionRow>(
        `select exploration_id, tenant_id, project_id, thread_id, user_id, status, execution_mode,
                name, instruction, start_url, recording_id, output_dir, summary, last_snapshot_markdown,
                sample_dataset_json, artifacts_json, created_test_case_id, created_test_case_version_id,
                default_dataset_row_id, started_at, finished_at, created_at, updated_at
           from ${table}
          where thread_id = $1
          order by updated_at desc
          limit 1`,
        [threadId],
      );
      if (result.rows[0]) {
        candidates.push(toExploration(result.rows[0]));
      }
    }

    candidates.sort((left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt));
    return candidates[0] ?? null;
  }

  async updateExploration(explorationId: string, input: UpdateExplorationInput): Promise<ExplorationSession> {
    const existing = await this.getExploration(explorationId);
    if (!existing) {
      throw new Error(`exploration not found: ${explorationId}`);
    }

    const tenantSchema = await this.#ensureTenantSchema(existing.tenantId);
    const table = this.#tableName(tenantSchema, 'exploration_sessions');
    await this.#pool.query(
      `update ${table}
          set status = $2,
              recording_id = $3,
              output_dir = $4,
              summary = $5,
              last_snapshot_markdown = $6,
              sample_dataset_json = $7::jsonb,
              artifacts_json = $8::jsonb,
              created_test_case_id = $9,
              created_test_case_version_id = $10,
              default_dataset_row_id = $11,
              started_at = $12,
              finished_at = $13,
              updated_at = $14
        where exploration_id = $1`,
      [
        explorationId,
        input.status ?? existing.status,
        input.recordingId ?? existing.recordingId,
        input.outputDir ?? existing.outputDir,
        input.summary ?? existing.summary,
        input.lastSnapshotMarkdown ?? existing.lastSnapshotMarkdown,
        JSON.stringify(input.sampleDataset ?? existing.sampleDataset),
        JSON.stringify(input.artifacts ?? existing.artifacts),
        input.createdTestCaseId ?? existing.createdTestCaseId,
        input.createdTestCaseVersionId ?? existing.createdTestCaseVersionId,
        input.defaultDatasetRowId ?? existing.defaultDatasetRowId,
        input.startedAt ?? existing.startedAt,
        input.finishedAt ?? existing.finishedAt,
        new Date().toISOString(),
      ],
    );

    const updated = await this.getExploration(explorationId);
    if (!updated) {
      throw new Error(`exploration not found after update: ${explorationId}`);
    }
    return updated;
  }

  async createSelfHealAttempt(input: CreateSelfHealAttemptInput): Promise<SelfHealAttempt> {
    const attemptId = randomUUID();
    const timestamp = new Date().toISOString();
    const tenantSchema = await this.#ensureTenantSchema(input.tenantId);
    const table = this.#tableName(tenantSchema, 'self_heal_attempts');
    await this.#pool.query(
      `insert into ${table} (
         self_heal_attempt_id, tenant_id, project_id, run_id, run_item_id, failed_step_event_id,
         source_step_id, failure_category, strategy_summary, explanation, override_json,
         replay_run_id, replay_run_status, derived_test_case_version_id, status, created_at, updated_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15, $16, $17)`,
      [
        attemptId,
        input.tenantId,
        input.projectId,
        input.runId,
        input.runItemId,
        input.failedStepEventId ?? null,
        input.sourceStepId,
        input.failureCategory,
        input.strategySummary,
        input.explanation ?? null,
        JSON.stringify(input.overridePayload ?? null),
        input.replayRunId ?? null,
        input.replayRunStatus ?? null,
        input.derivedTestCaseVersionId ?? null,
        input.status,
        timestamp,
        timestamp,
      ],
    );
    await this.#upsertSelfHealAttemptLocator(this.#pool, attemptId, input.tenantId, input.projectId);
    const attempt = await this.getSelfHealAttempt(attemptId);
    if (!attempt) {
      throw new Error(`self-heal attempt not found after create: ${attemptId}`);
    }
    return attempt;
  }

  async getSelfHealAttempt(selfHealAttemptId: string): Promise<SelfHealAttempt | null> {
    const locator = await this.#getSelfHealLocator(selfHealAttemptId);
    if (!locator) {
      return null;
    }

    const tenantSchema = await this.#ensureTenantSchema(locator.tenant_id);
    const table = this.#tableName(tenantSchema, 'self_heal_attempts');
    const result = await this.#pool.query<SelfHealAttemptRow>(
      `select self_heal_attempt_id, tenant_id, project_id, run_id, run_item_id, failed_step_event_id,
              source_step_id, failure_category, strategy_summary, explanation, override_json,
              replay_run_id, replay_run_status, derived_test_case_version_id, status, created_at, updated_at
         from ${table}
        where self_heal_attempt_id = $1
        limit 1`,
      [selfHealAttemptId],
    );
    return result.rows[0] ? toSelfHealAttempt(result.rows[0]) : null;
  }

  async getLatestSelfHealAttemptForRunItem(runItemId: string): Promise<SelfHealAttempt | null> {
    const locatorResult = await this.#pool.query<SelfHealLocatorRow & { self_heal_attempt_id: string }>(
      `select self_heal_attempt_id, tenant_id, project_id
         from self_heal_attempt_locators`,
    ).catch(() => ({ rows: [] }));

    const candidates: SelfHealAttempt[] = [];
    for (const locator of locatorResult.rows) {
      const tenantSchema = await this.#ensureTenantSchema(locator.tenant_id);
      const table = this.#tableName(tenantSchema, 'self_heal_attempts');
      const result = await this.#pool.query<SelfHealAttemptRow>(
        `select self_heal_attempt_id, tenant_id, project_id, run_id, run_item_id, failed_step_event_id,
                source_step_id, failure_category, strategy_summary, explanation, override_json,
                replay_run_id, replay_run_status, derived_test_case_version_id, status, created_at, updated_at
           from ${table}
          where run_item_id = $1
          order by updated_at desc
          limit 1`,
        [runItemId],
      );
      if (result.rows[0]) {
        candidates.push(toSelfHealAttempt(result.rows[0]));
      }
    }

    candidates.sort((left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt));
    return candidates[0] ?? null;
  }

  async getLatestSelfHealAttemptByReplayRunId(replayRunId: string): Promise<SelfHealAttempt | null> {
    const locatorResult = await this.#pool.query<SelfHealLocatorRow & { self_heal_attempt_id: string }>(
      `select self_heal_attempt_id, tenant_id, project_id
         from self_heal_attempt_locators`,
    ).catch(() => ({ rows: [] }));

    const candidates: SelfHealAttempt[] = [];
    for (const locator of locatorResult.rows) {
      const tenantSchema = await this.#ensureTenantSchema(locator.tenant_id);
      const table = this.#tableName(tenantSchema, 'self_heal_attempts');
      const result = await this.#pool.query<SelfHealAttemptRow>(
        `select self_heal_attempt_id, tenant_id, project_id, run_id, run_item_id, failed_step_event_id,
                source_step_id, failure_category, strategy_summary, explanation, override_json,
                replay_run_id, replay_run_status, derived_test_case_version_id, status, created_at, updated_at
           from ${table}
          where replay_run_id = $1
          order by updated_at desc
          limit 1`,
        [replayRunId],
      );
      if (result.rows[0]) {
        candidates.push(toSelfHealAttempt(result.rows[0]));
      }
    }

    candidates.sort((left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt));
    return candidates[0] ?? null;
  }

  async updateSelfHealAttempt(selfHealAttemptId: string, input: UpdateSelfHealAttemptInput): Promise<SelfHealAttempt> {
    const existing = await this.getSelfHealAttempt(selfHealAttemptId);
    if (!existing) {
      throw new Error(`self-heal attempt not found: ${selfHealAttemptId}`);
    }

    const tenantSchema = await this.#ensureTenantSchema(existing.tenantId);
    const table = this.#tableName(tenantSchema, 'self_heal_attempts');
    await this.#pool.query(
      `update ${table}
          set explanation = $2,
              override_json = $3::jsonb,
              replay_run_id = $4,
              replay_run_status = $5,
              derived_test_case_version_id = $6,
              status = $7,
              updated_at = $8
        where self_heal_attempt_id = $1`,
      [
        selfHealAttemptId,
        input.explanation ?? existing.explanation,
        JSON.stringify(input.overridePayload ?? existing.overridePayload),
        input.replayRunId ?? existing.replayRunId,
        input.replayRunStatus ?? existing.replayRunStatus,
        input.derivedTestCaseVersionId ?? existing.derivedTestCaseVersionId,
        input.status ?? existing.status,
        new Date().toISOString(),
      ],
    );

    const updated = await this.getSelfHealAttempt(selfHealAttemptId);
    if (!updated) {
      throw new Error(`self-heal attempt missing after update: ${selfHealAttemptId}`);
    }
    return updated;
  }

  async createRunEvaluation(input: CreateRunEvaluationInput): Promise<RunEvaluation> {
    const evaluationId = randomUUID();
    const timestamp = new Date().toISOString();
    const tenantSchema = await this.#ensureTenantSchema(input.tenantId);
    const table = this.#tableName(tenantSchema, 'run_evaluations');
    await this.#pool.query(
      `insert into ${table} (
         run_evaluation_id, tenant_id, project_id, run_id, run_item_id, verdict, deterministic_summary_json,
         explanation, evidence_json, linked_artifact_ids_json, self_heal_attempt_id, created_at, updated_at
       ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10::jsonb, $11, $12, $13)`,
      [
        evaluationId,
        input.tenantId,
        input.projectId,
        input.runId,
        input.runItemId,
        input.verdict,
        JSON.stringify(input.deterministicSummary),
        input.explanation,
        JSON.stringify(input.evidence ?? []),
        JSON.stringify(input.linkedArtifactIds ?? []),
        input.selfHealAttemptId ?? null,
        timestamp,
        timestamp,
      ],
    );
    await this.#upsertRunEvaluationLocator(this.#pool, evaluationId, input.tenantId, input.projectId);
    const evaluation = await this.getRunEvaluation(evaluationId);
    if (!evaluation) {
      throw new Error(`run evaluation not found after create: ${evaluationId}`);
    }
    return evaluation;
  }

  async getRunEvaluation(runEvaluationId: string): Promise<RunEvaluation | null> {
    const locator = await this.#getRunEvaluationLocator(runEvaluationId);
    if (!locator) {
      return null;
    }

    const tenantSchema = await this.#ensureTenantSchema(locator.tenant_id);
    const table = this.#tableName(tenantSchema, 'run_evaluations');
    const result = await this.#pool.query<RunEvaluationRow>(
      `select run_evaluation_id, tenant_id, project_id, run_id, run_item_id, verdict, deterministic_summary_json,
              explanation, evidence_json, linked_artifact_ids_json, self_heal_attempt_id, created_at, updated_at
         from ${table}
        where run_evaluation_id = $1
        limit 1`,
      [runEvaluationId],
    );
    return result.rows[0] ? toRunEvaluation(result.rows[0]) : null;
  }

  #tableName(tenantId: string, tableName: string): string {
    return `${quotePostgresIdentifier(tenantId)}.${quotePostgresIdentifier(tableName)}`;
  }

  async #reconcileExistingTenantSchemas(): Promise<void> {
    const result = await this.#pool.query<{ tenant_id: string }>(
      `select tenant_id
         from tenant_schemas
        order by tenant_id asc`,
    ).catch(() => ({ rows: [] }));

    for (const row of result.rows) {
      await this.#reconcileTenantSchema(row.tenant_id, this.#pool);
      this.#ensuredTenantSchemas.add(row.tenant_id);
    }
  }

  async #ensureTenantSchema(
    tenantId: string,
    executor: SqlPoolLike | SqlPoolClientLike = this.#pool,
  ): Promise<string> {
    if (!tenantId.trim()) {
      throw new Error('tenantId is required for postgres orchestration store');
    }

    if (this.#ensuredTenantSchemas.has(tenantId)) {
      return tenantId;
    }

    await executor.query(
      `insert into tenant_schemas (tenant_id, schema_name)
       values ($1, $2)
       on conflict (tenant_id) do update set
         schema_name = excluded.schema_name,
         updated_at = now()`,
      [tenantId, tenantId],
    );
    await this.#reconcileTenantSchema(tenantId, executor);
    this.#ensuredTenantSchemas.add(tenantId);
    return tenantId;
  }

  async #reconcileTenantSchema(tenantId: string, executor: SqlPoolLike | SqlPoolClientLike): Promise<void> {
    await executor.query(buildAssistantTenantSchemaSql(tenantId));
  }

  async #getExplorationLocator(explorationId: string): Promise<ExplorationLocatorRow | undefined> {
    const result = await this.#pool.query<ExplorationLocatorRow>(
      `select tenant_id, project_id
         from exploration_session_locators
        where exploration_id = $1
        limit 1`,
      [explorationId],
    );
    return result.rows[0];
  }

  async #getSelfHealLocator(selfHealAttemptId: string): Promise<SelfHealLocatorRow | undefined> {
    const result = await this.#pool.query<SelfHealLocatorRow>(
      `select tenant_id, project_id
         from self_heal_attempt_locators
        where self_heal_attempt_id = $1
        limit 1`,
      [selfHealAttemptId],
    );
    return result.rows[0];
  }

  async #getRunEvaluationLocator(runEvaluationId: string): Promise<RunEvaluationLocatorRow | undefined> {
    const result = await this.#pool.query<RunEvaluationLocatorRow>(
      `select tenant_id, project_id
         from run_evaluation_locators
        where run_evaluation_id = $1
        limit 1`,
      [runEvaluationId],
    );
    return result.rows[0];
  }

  async #upsertExplorationLocator(
    executor: SqlPoolLike | SqlPoolClientLike,
    explorationId: string,
    tenantId: string,
    projectId: string,
  ): Promise<void> {
    await executor.query(
      `insert into exploration_session_locators (exploration_id, tenant_id, project_id)
       values ($1, $2, $3)
       on conflict (exploration_id) do update set
         tenant_id = excluded.tenant_id,
         project_id = excluded.project_id,
         updated_at = now()`,
      [explorationId, tenantId, projectId],
    );
  }

  async #upsertSelfHealAttemptLocator(
    executor: SqlPoolLike | SqlPoolClientLike,
    selfHealAttemptId: string,
    tenantId: string,
    projectId: string,
  ): Promise<void> {
    await executor.query(
      `insert into self_heal_attempt_locators (self_heal_attempt_id, tenant_id, project_id)
       values ($1, $2, $3)
       on conflict (self_heal_attempt_id) do update set
         tenant_id = excluded.tenant_id,
         project_id = excluded.project_id,
         updated_at = now()`,
      [selfHealAttemptId, tenantId, projectId],
    );
  }

  async #upsertRunEvaluationLocator(
    executor: SqlPoolLike | SqlPoolClientLike,
    runEvaluationId: string,
    tenantId: string,
    projectId: string,
  ): Promise<void> {
    await executor.query(
      `insert into run_evaluation_locators (run_evaluation_id, tenant_id, project_id)
       values ($1, $2, $3)
       on conflict (run_evaluation_id) do update set
         tenant_id = excluded.tenant_id,
         project_id = excluded.project_id,
         updated_at = now()`,
      [runEvaluationId, tenantId, projectId],
    );
  }
}
