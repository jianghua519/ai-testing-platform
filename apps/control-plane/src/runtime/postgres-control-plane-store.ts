import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type {
  ControlPlaneAcquireLeaseInput,
  ControlPlaneAcquireLeaseResult,
  ControlPlaneArtifactRecord,
  ControlPlaneAuthenticatedActor,
  ControlPlaneCreateRecordingEventInput,
  ControlPlaneCreateRecordingInput,
  ControlPlaneCreateDatasetRowInput,
  ControlPlaneCreateTestCaseInput,
  ControlPlaneCreateTestCaseResult,
  ControlPlaneCreateTestCaseVersionInput,
  ControlPlaneCreateTestCaseVersionResult,
  ControlPlaneDeriveTestCaseResult,
  ControlPlaneCompleteLeaseInput,
  ControlPlaneDataTemplateVersionRecord,
  ControlPlaneDatasetRowRecord,
  ControlPlaneEnqueueCaseVersionRunInput,
  ControlPlaneEnqueueWebRunInput,
  ControlPlaneEnqueueWebRunResult,
  ControlPlaneHeartbeatAgentInput,
  ControlPlaneHeartbeatLeaseInput,
  ControlPlaneJobLeaseRecord,
  ControlPlaneAgentRecord,
  ControlPlaneExtractTestCaseInput,
  ControlPlaneListArtifactsQuery,
  ControlPlaneListDatasetRowsQuery,
  ControlPlaneListExpiredArtifactsQuery,
  ControlPlaneListRunItemsQuery,
  ControlPlaneListRunsQuery,
  ControlPlaneListStepEventsQuery,
  ControlPlaneListTestCasesQuery,
  ControlPlaneListTestCaseVersionsQuery,
  ControlPlaneMigrationRecord,
  ControlPlanePage,
  ControlPlanePrincipal,
  ControlPlanePublishRecordingInput,
  ControlPlaneRegisterAgentInput,
  ControlPlaneRecordingAnalysisJobRecord,
  ControlPlaneRecordingRecord,
  ControlPlaneRunItemRecord,
  ControlPlaneRunRecord,
  ControlPlaneStateSnapshot,
  ControlPlaneStepEventRecord,
  ControlPlaneStore,
  ControlPlaneTestCaseRecord,
  ControlPlaneTestCaseVersionRecord,
  ControlPlaneUpdateDatasetRowInput,
  ControlPlaneUpdateTestCaseInput,
  RecordedRunnerEvent,
  RecordRunnerEventResult,
  RunnerResultEnvelope,
} from '../types.js';
import type { ArtifactReference } from '@aiwtp/web-dsl-schema';
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
import { decodeCursor } from './pagination.js';
import { buildTenantBusinessSchemaSql, quotePostgresIdentifier } from './postgres-schema.js';
import {
  type AgentRow,
  buildStepDecision,
  buildStepEventValues,
  type DataTemplateVersionRow,
  type DatasetRow,
  type DerivableRunItemRow,
  type EntityLocatorRow,
  type ExpiredLeaseRow,
  mapAgent,
  mapArtifact,
  mapCompletionToProjectionStatus,
  mapDataTemplateVersion,
  mapDatasetRow,
  mapLease,
  mapRecording,
  mapRecordingAnalysisJob,
  mapRunItemProjection,
  mapRunProjection,
  mapStepEventProjection,
  mapTestCase,
  mapTestCaseVersion,
  type QueuedRunItemRow,
  parseJsonColumn,
  parseLocatorColumn,
  type RecordingAnalysisJobRow,
  type RecordingEventRow,
  type RecordingRow,
  resolveArtifactRetentionExpiresAt,
  type RunnerEventRow,
  type RunItemProjectionRow,
  type RunProjectionRow,
  type SnapshotDecisionRow,
  type StepDecisionRow,
  type StepEventProjectionRow,
  type SubjectProjectMembershipRow,
  type TenantSchemaRow,
  toPage,
  toProjectionStatus,
  toProjectionTimestamps,
  toRunnerEventFields,
  type ArtifactRow,
  type LeaseRow,
  isArtifactReference,
  isJobResultEnvelope,
  isStepResultEnvelope,
  type TestCaseRow,
  type TestCaseVersionRow,
  upsertProjectionStatusSql,
} from './postgres-control-plane-store-support.js';
import {
  analyzeRecordingEvents,
  ControlPlaneRequestError,
  buildExecutionInputSnapshot,
  deriveTemplateSchemaFromPlan,
  ensureDefaultDatasetValues,
  filterDatasetValuesForSchema,
  validateDatasetValues,
} from './test-assets.js';

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

export interface PostgresControlPlaneStoreOptions {
  connectionString?: string;
  pool?: SqlPoolLike;
  runMigrations?: boolean;
  autoMigrate?: boolean;
}

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
    await store.reconcileExistingTenantSchemas();
    return store;
  }

  async runMigrations(): Promise<ControlPlaneMigrationRecord[]> {
    return runControlPlanePostgresMigrations(this.pool);
  }

  async listAppliedMigrations(): Promise<ControlPlaneMigrationRecord[]> {
    return listControlPlanePostgresMigrations(this.pool);
  }

  async createRecording(
    input: ControlPlaneCreateRecordingInput,
    actor: { subjectId: string },
  ): Promise<ControlPlaneRecordingRecord> {
    const now = new Date().toISOString();
    const recordingId = randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const tenantSchema = await this.ensureTenantSchema(input.tenantId, client);
      const recordingsTable = this.tableName(tenantSchema, 'recordings');
      await client.query(
        `insert into ${recordingsTable} (
           recording_id, tenant_id, project_id, name, status, source_type, env_profile_json,
           started_at, finished_at, created_by, created_at, updated_at
         ) values (
           $1, $2, $3, $4, 'draft', $5, $6::jsonb, $7, $8, $9, $10, $10
         )`,
        [
          recordingId,
          input.tenantId,
          input.projectId,
          input.name,
          input.sourceType,
          JSON.stringify(input.envProfile),
          input.startedAt ?? now,
          input.finishedAt ?? null,
          actor.subjectId,
          now,
        ],
      );
      await this.upsertRecordingLocator(client, {
        recordingId,
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
      recordingId,
      tenantId: input.tenantId,
      projectId: input.projectId,
      name: input.name,
      status: 'draft',
      sourceType: input.sourceType,
      envProfile: input.envProfile,
      startedAt: input.startedAt ?? now,
      finishedAt: input.finishedAt ?? null,
      createdBy: actor.subjectId,
      createdAt: now,
      updatedAt: now,
    };
  }

  async getRecording(recordingId: string): Promise<ControlPlaneRecordingRecord | undefined> {
    const locator = await this.getRecordingLocator(recordingId);
    if (!locator?.tenant_id) {
      return undefined;
    }

    const recordingsTable = this.tableName(locator.tenant_id, 'recordings');
    const result = await this.pool.query<RecordingRow>(
      `select recording_id, tenant_id, project_id, name, status, source_type, env_profile_json,
              started_at, finished_at, created_by, created_at, updated_at
       from ${recordingsTable}
       where recording_id = $1
       limit 1`,
      [recordingId],
    );
    return result.rows[0] ? mapRecording(result.rows[0]) : undefined;
  }

  async appendRecordingEvents(
    recordingId: string,
    events: ControlPlaneCreateRecordingEventInput[],
    actor: { subjectId: string },
  ): Promise<{ recording: ControlPlaneRecordingRecord; appendedCount: number } | undefined> {
    const recording = await this.getRecording(recordingId);
    if (!recording) {
      return undefined;
    }
    if (recording.status === 'published') {
      throw new ControlPlaneRequestError(409, 'RECORDING_ALREADY_PUBLISHED', 'recording is already published');
    }

    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const tenantSchema = await this.ensureTenantSchema(recording.tenantId, client);
      const eventsTable = this.tableName(tenantSchema, 'recording_events');
      const recordingsTable = this.tableName(tenantSchema, 'recordings');
      const seqResult = await client.query<{ max_seq_no: number | null }>(
        `select max(seq_no)::int as max_seq_no
         from ${eventsTable}
         where recording_id = $1`,
        [recordingId],
      );
      let nextSeqNo = seqResult.rows[0]?.max_seq_no ?? 0;
      const now = new Date().toISOString();

      for (const event of events) {
        nextSeqNo += 1;
        await client.query(
          `insert into ${eventsTable} (
             recording_event_id, recording_id, seq_no, event_type, page_url, locator_json, payload_json, captured_at
           ) values (
             $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8
           )`,
          [
            randomUUID(),
            recordingId,
            nextSeqNo,
            event.eventType,
            event.pageUrl ?? null,
            JSON.stringify(event.locator ?? null),
            JSON.stringify(event.payload ?? {}),
            event.capturedAt ?? now,
          ],
        );
      }

      await client.query(
        `update ${recordingsTable}
         set updated_at = now()
         where recording_id = $1`,
        [recordingId],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }

    const refreshed = await this.getRecording(recordingId);
    return refreshed
      ? {
        recording: refreshed,
        appendedCount: events.length,
      }
      : undefined;
  }

  async analyzeRecordingDsl(
    recordingId: string,
    actor: { subjectId: string },
  ): Promise<ControlPlaneRecordingAnalysisJobRecord | undefined> {
    const recording = await this.getRecording(recordingId);
    if (!recording) {
      return undefined;
    }

    const events = await this.listRecordingEvents(recordingId);
    if (events.length === 0) {
      throw new ControlPlaneRequestError(400, 'RECORDING_EVENTS_REQUIRED', 'recording has no events to analyze');
    }

    const analysis = analyzeRecordingEvents(recording, events.map((event) => ({
      eventType: event.event_type,
      pageUrl: event.page_url,
      locator: parseLocatorColumn(event.locator_json),
      payload: parseJsonColumn<Record<string, unknown>>(event.payload_json) ?? {},
    })));

    const now = new Date().toISOString();
    const jobId = randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const tenantSchema = await this.ensureTenantSchema(recording.tenantId, client);
      const jobsTable = this.tableName(tenantSchema, 'recording_analysis_jobs');
      const recordingsTable = this.tableName(tenantSchema, 'recordings');
      await client.query(
        `insert into ${jobsTable} (
           recording_analysis_job_id, recording_id, tenant_id, project_id, status, dsl_plan_json,
           structured_plan_json, data_template_draft_json, started_at, finished_at, created_by, created_at
         ) values (
           $1, $2, $3, $4, 'succeeded', $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10, $8
         )`,
        [
          jobId,
          recordingId,
          recording.tenantId,
          recording.projectId,
          JSON.stringify(analysis.dslPlan),
          JSON.stringify(analysis.structuredPlan),
          JSON.stringify(analysis.dataTemplateDraft),
          now,
          now,
          actor.subjectId,
        ],
      );
      await client.query(
        `update ${recordingsTable}
         set status = 'analyzed',
             updated_at = now()
         where recording_id = $1`,
        [recordingId],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }

    return {
      recordingAnalysisJobId: jobId,
      recordingId,
      tenantId: recording.tenantId,
      projectId: recording.projectId,
      status: 'succeeded',
      dslPlan: analysis.dslPlan,
      structuredPlan: analysis.structuredPlan,
      dataTemplateDraft: analysis.dataTemplateDraft,
      startedAt: now,
      finishedAt: now,
      createdBy: actor.subjectId,
      createdAt: now,
    };
  }

  async publishRecordingAsTestCase(
    recordingId: string,
    input: ControlPlanePublishRecordingInput,
    actor: { subjectId: string },
  ): Promise<ControlPlaneCreateTestCaseResult | undefined> {
    const recording = await this.getRecording(recordingId);
    if (!recording) {
      return undefined;
    }

    const analysisJob = input.analysisJobId
      ? await this.getRecordingAnalysisJob(recordingId, input.analysisJobId)
      : await this.getLatestRecordingAnalysisJob(recordingId);
    if (!analysisJob || analysisJob.status !== 'succeeded' || !analysisJob.dslPlan) {
      throw new ControlPlaneRequestError(409, 'RECORDING_ANALYSIS_REQUIRED', 'recording must have a successful analysis result before publish');
    }

    const created = await this.createTestCase({
      tenantId: recording.tenantId,
      projectId: recording.projectId,
      name: input.name ?? recording.name,
      plan: analysisJob.dslPlan,
      envProfile: recording.envProfile,
      versionLabel: input.versionLabel,
      changeSummary: input.changeSummary ?? `published from recording ${recordingId}`,
      publish: input.publish,
      sourceRecordingId: recording.recordingId,
      defaultDataset: input.defaultDataset,
    }, actor);

    const tenantSchema = await this.ensureTenantSchema(recording.tenantId);
    const recordingsTable = this.tableName(tenantSchema, 'recordings');
    await this.pool.query(
      `update ${recordingsTable}
       set status = 'published',
           finished_at = coalesce(finished_at, now()),
           updated_at = now()
       where recording_id = $1`,
      [recordingId],
    );

    return created;
  }

  async extractTestCaseFromRunItem(
    runItemId: string,
    input: ControlPlaneExtractTestCaseInput,
    actor: { subjectId: string },
  ): Promise<ControlPlaneDeriveTestCaseResult | undefined> {
    const runItem = await this.getRunItemForDerivation(runItemId);
    if (!runItem) {
      return undefined;
    }
    if (!['passed', 'failed', 'canceled'].includes(runItem.status)) {
      throw new ControlPlaneRequestError(409, 'RUN_ITEM_NOT_COMPLETED', 'run item must be completed before extraction');
    }

    const job = parseJsonColumn<WebWorkerJob>(runItem.job_payload_json);
    if (!job) {
      throw new ControlPlaneRequestError(409, 'RUN_ITEM_JOB_PAYLOAD_MISSING', 'run item job payload is missing');
    }

    const schema = deriveTemplateSchemaFromPlan(job.plan);
    const inputSnapshot = parseJsonColumn<Record<string, unknown>>(runItem.input_snapshot_json) ?? {};
    const defaultDatasetValues = filterDatasetValuesForSchema(schema, inputSnapshot);
    const defaultDataset = {
      name: input.defaultDatasetName ?? `run-item-${runItemId}`,
      values: defaultDatasetValues,
    };

    if (runItem.test_case_id) {
      const created = await this.createTestCaseVersion(
        runItem.test_case_id,
        {
          plan: job.plan,
          envProfile: job.envProfile,
          versionLabel: input.versionLabel,
          changeSummary: input.changeSummary ?? `extracted from run item ${runItemId}`,
          publish: input.publish,
          sourceRecordingId: runItem.source_recording_id ?? undefined,
          sourceRunId: runItem.run_id,
          derivedFromCaseVersionId: runItem.test_case_version_id ?? undefined,
          defaultDataset,
        },
        actor,
      );
      if (!created) {
        return undefined;
      }
      return {
        derivationMode: 'new_version',
        testCase: created.testCase,
        version: created.version,
        dataTemplateVersion: created.dataTemplateVersion,
        defaultDatasetRow: created.defaultDatasetRow,
      };
    }

    const created = await this.createTestCase(
      {
        tenantId: runItem.tenant_id,
        projectId: runItem.project_id,
        name: input.name ?? `Extracted run item ${runItemId}`,
        plan: job.plan,
        envProfile: job.envProfile,
        versionLabel: input.versionLabel,
        changeSummary: input.changeSummary ?? `extracted from run item ${runItemId}`,
        publish: input.publish,
        sourceRecordingId: runItem.source_recording_id ?? undefined,
        sourceRunId: runItem.run_id,
        defaultDataset,
      },
      actor,
    );
    return {
      derivationMode: 'new_case',
      testCase: created.testCase,
      version: created.version,
      dataTemplateVersion: created.dataTemplateVersion,
      defaultDatasetRow: created.defaultDatasetRow,
    };
  }

  async createTestCase(
    input: ControlPlaneCreateTestCaseInput,
    actor: { subjectId: string },
  ): Promise<ControlPlaneCreateTestCaseResult> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const tenantSchema = await this.ensureTenantSchema(input.tenantId, client);
      const bundle = await this.insertNewTestCaseBundle(client, tenantSchema, input, actor);
      await client.query('commit');
      return bundle;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async listTestCases(query: ControlPlaneListTestCasesQuery): Promise<ControlPlanePage<ControlPlaneTestCaseRecord>> {
    const tenantSchema = await this.resolveTenantSchema(query.tenantId);
    if (!tenantSchema) {
      return { items: [] };
    }

    const cursor = decodeCursor(query.cursor);
    const values: unknown[] = [query.tenantId, query.projectId];
    const table = this.tableName(tenantSchema, 'test_cases');
    let sql = `select test_case_id, tenant_id, project_id, data_template_id, name, status,
                      latest_version_id, latest_published_version_id, created_by, updated_by, created_at, updated_at
       from ${table}
       where tenant_id = $1
         and project_id = $2
         and status <> 'archived'`;

    if (cursor) {
      values.push(cursor.primary, cursor.secondary);
      sql += `
         and (created_at, test_case_id) < ($3::timestamptz, $4)`;
    }

    values.push(query.limit + 1);
    sql += `
       order by created_at desc, test_case_id desc
       limit $${values.length}`;

    const result = await this.pool.query<TestCaseRow>(sql, values);
    return toPage(result.rows.map(mapTestCase), query.limit, (item) => ({
      primary: item.createdAt,
      secondary: item.testCaseId,
    }));
  }

  async getTestCase(testCaseId: string): Promise<ControlPlaneTestCaseRecord | undefined> {
    const locator = await this.getTestCaseLocator(testCaseId);
    if (!locator?.tenant_id) {
      return undefined;
    }

    const table = this.tableName(locator.tenant_id, 'test_cases');
    const result = await this.pool.query<TestCaseRow>(
      `select test_case_id, tenant_id, project_id, data_template_id, name, status,
              latest_version_id, latest_published_version_id, created_by, updated_by, created_at, updated_at
       from ${table}
       where test_case_id = $1
       limit 1`,
      [testCaseId],
    );
    return result.rows[0] ? mapTestCase(result.rows[0]) : undefined;
  }

  async updateTestCase(
    testCaseId: string,
    input: ControlPlaneUpdateTestCaseInput,
    actor: { subjectId: string },
  ): Promise<ControlPlaneTestCaseRecord | undefined> {
    const locator = await this.getTestCaseLocator(testCaseId);
    if (!locator?.tenant_id) {
      return undefined;
    }

    const table = this.tableName(locator.tenant_id, 'test_cases');
    const result = await this.pool.query<TestCaseRow>(
      `update ${table}
       set name = coalesce($2, name),
           status = coalesce($3, status),
           updated_by = $4,
           updated_at = now()
       where test_case_id = $1
       returning test_case_id, tenant_id, project_id, data_template_id, name, status,
                 latest_version_id, latest_published_version_id, created_by, updated_by, created_at, updated_at`,
      [testCaseId, input.name ?? null, input.status ?? null, actor.subjectId],
    );
    return result.rows[0] ? mapTestCase(result.rows[0]) : undefined;
  }

  async archiveTestCase(
    testCaseId: string,
    actor: { subjectId: string },
  ): Promise<ControlPlaneTestCaseRecord | undefined> {
    return this.updateTestCase(testCaseId, { status: 'archived' }, actor);
  }

  async listTestCaseVersions(query: ControlPlaneListTestCaseVersionsQuery): Promise<ControlPlanePage<ControlPlaneTestCaseVersionRecord>> {
    const testCase = await this.getTestCase(query.testCaseId);
    if (!testCase) {
      return { items: [] };
    }

    const cursor = decodeCursor(query.cursor);
    const values: unknown[] = [query.testCaseId];
    const versionsTable = this.tableName(testCase.tenantId, 'test_case_versions');
    const bindingsTable = this.tableName(testCase.tenantId, 'case_default_dataset_bindings');
    let sql = `select version.test_case_version_id, version.test_case_id, version.tenant_id, version.project_id,
                      version.version_no, version.version_label, version.status, version.plan_json, version.env_profile_json,
                      version.data_template_id, version.data_template_version_id, binding.dataset_row_id as default_dataset_row_id,
                      version.source_recording_id, version.source_run_id, version.derived_from_case_version_id,
                      version.change_summary, version.created_by, version.created_at
       from ${versionsTable} version
       left join ${bindingsTable} binding
         on binding.test_case_version_id = version.test_case_version_id
       where version.test_case_id = $1`;

    if (cursor) {
      values.push(cursor.primary, cursor.secondary);
      sql += `
         and (version.created_at, version.test_case_version_id) < ($2::timestamptz, $3)`;
    }

    values.push(query.limit + 1);
    sql += `
       order by version.created_at desc, version.test_case_version_id desc
       limit $${values.length}`;

    const result = await this.pool.query<TestCaseVersionRow>(sql, values);
    return toPage(result.rows.map(mapTestCaseVersion), query.limit, (item) => ({
      primary: item.createdAt,
      secondary: item.testCaseVersionId,
    }));
  }

  async createTestCaseVersion(
    testCaseId: string,
    input: ControlPlaneCreateTestCaseVersionInput,
    actor: { subjectId: string },
  ): Promise<ControlPlaneCreateTestCaseVersionResult | undefined> {
    const locator = await this.getTestCaseLocator(testCaseId);
    if (!locator?.tenant_id) {
      return undefined;
    }

    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const tenantSchema = await this.ensureTenantSchema(locator.tenant_id, client);
      const bundle = await this.insertAdditionalTestCaseVersionBundle(client, tenantSchema, testCaseId, input, actor);
      await client.query('commit');
      return bundle;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async getTestCaseVersion(testCaseVersionId: string): Promise<ControlPlaneTestCaseVersionRecord | undefined> {
    const locator = await this.getTestCaseVersionLocator(testCaseVersionId);
    if (!locator?.tenant_id) {
      return undefined;
    }

    const versionsTable = this.tableName(locator.tenant_id, 'test_case_versions');
    const bindingsTable = this.tableName(locator.tenant_id, 'case_default_dataset_bindings');
    const result = await this.pool.query<TestCaseVersionRow>(
      `select version.test_case_version_id, version.test_case_id, version.tenant_id, version.project_id,
              version.version_no, version.version_label, version.status, version.plan_json, version.env_profile_json,
              version.data_template_id, version.data_template_version_id, binding.dataset_row_id as default_dataset_row_id,
              version.source_recording_id, version.source_run_id, version.derived_from_case_version_id,
              version.change_summary, version.created_by, version.created_at
       from ${versionsTable} version
       left join ${bindingsTable} binding
         on binding.test_case_version_id = version.test_case_version_id
       where version.test_case_version_id = $1
       limit 1`,
      [testCaseVersionId],
    );
    return result.rows[0] ? mapTestCaseVersion(result.rows[0]) : undefined;
  }

  async publishTestCaseVersion(
    testCaseVersionId: string,
    actor: { subjectId: string },
  ): Promise<ControlPlaneTestCaseVersionRecord | undefined> {
    const locator = await this.getTestCaseVersionLocator(testCaseVersionId);
    if (!locator?.tenant_id) {
      return undefined;
    }

    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const tenantSchema = await this.ensureTenantSchema(locator.tenant_id, client);
      const testCasesTable = this.tableName(tenantSchema, 'test_cases');
      const versionsTable = this.tableName(tenantSchema, 'test_case_versions');
      const version = await this.getTestCaseVersionForUpdate(client, tenantSchema, testCaseVersionId);
      if (!version) {
        await client.query('rollback');
        return undefined;
      }

      await client.query(
        `update ${versionsTable}
         set status = 'published'
         where test_case_version_id = $1`,
        [testCaseVersionId],
      );
      await client.query(
        `update ${testCasesTable}
         set latest_published_version_id = $2,
             status = 'active',
             updated_by = $3,
             updated_at = now()
         where test_case_id = $1`,
        [version.testCaseId, testCaseVersionId, actor.subjectId],
      );

      await client.query('commit');
      return this.getTestCaseVersion(testCaseVersionId);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async getDataTemplateForCaseVersion(testCaseVersionId: string): Promise<ControlPlaneDataTemplateVersionRecord | undefined> {
    const version = await this.getTestCaseVersion(testCaseVersionId);
    if (!version) {
      return undefined;
    }

    const table = this.tableName(version.tenantId, 'data_template_versions');
    const bindingsTable = this.tableName(version.tenantId, 'case_default_dataset_bindings');
    const result = await this.pool.query<DataTemplateVersionRow>(
      `select template.data_template_id, template.data_template_version_id, template.test_case_id, template.tenant_id, template.project_id,
              template.version_no, template.schema_json, template.validation_rules_json, binding.dataset_row_id as default_dataset_row_id,
              template.created_by, template.created_at
       from ${table} template
       left join ${bindingsTable} binding
         on binding.test_case_version_id = $1
       where template.data_template_version_id = $2
       limit 1`,
      [testCaseVersionId, version.dataTemplateVersionId],
    );
    return result.rows[0] ? mapDataTemplateVersion(result.rows[0]) : undefined;
  }

  async listDatasetRows(query: ControlPlaneListDatasetRowsQuery): Promise<ControlPlanePage<ControlPlaneDatasetRowRecord>> {
    const version = await this.getTestCaseVersion(query.testCaseVersionId);
    if (!version) {
      return { items: [] };
    }

    const cursor = decodeCursor(query.cursor);
    const values: unknown[] = [version.dataTemplateVersionId];
    const table = this.tableName(version.tenantId, 'dataset_rows');
    let sql = `select dataset_row_id, test_case_id, data_template_version_id, tenant_id, project_id,
                      name, status, values_json, created_by, updated_by, created_at, updated_at
       from ${table}
       where data_template_version_id = $1
         and status <> 'archived'`;

    if (cursor) {
      values.push(cursor.primary, cursor.secondary);
      sql += `
         and (created_at, dataset_row_id) < ($2::timestamptz, $3)`;
    }

    values.push(query.limit + 1);
    sql += `
       order by created_at desc, dataset_row_id desc
       limit $${values.length}`;

    const result = await this.pool.query<DatasetRow>(sql, values);
    return toPage(result.rows.map(mapDatasetRow), query.limit, (item) => ({
      primary: item.createdAt,
      secondary: item.datasetRowId,
    }));
  }

  async createDatasetRow(
    testCaseVersionId: string,
    input: ControlPlaneCreateDatasetRowInput,
    actor: { subjectId: string },
  ): Promise<ControlPlaneDatasetRowRecord | undefined> {
    const version = await this.getTestCaseVersion(testCaseVersionId);
    if (!version) {
      return undefined;
    }
    const template = await this.getDataTemplateForCaseVersion(testCaseVersionId);
    if (!template) {
      return undefined;
    }

    const values = validateDatasetValues(template.schema, input.values);
    const datasetRowId = randomUUID();
    const now = new Date().toISOString();
    const table = this.tableName(version.tenantId, 'dataset_rows');
    await this.pool.query(
      `insert into ${table} (
         dataset_row_id, data_template_version_id, test_case_id, tenant_id, project_id,
         name, status, values_json, created_by, updated_by, created_at, updated_at
       ) values (
         $1, $2, $3, $4, $5, $6, 'active', $7::jsonb, $8, $8, $9, $9
       )`,
      [
        datasetRowId,
        version.dataTemplateVersionId,
        version.testCaseId,
        version.tenantId,
        version.projectId,
        input.name ?? `dataset-${now}`,
        JSON.stringify(values),
        actor.subjectId,
        now,
      ],
    );
    await this.upsertDatasetRowLocator(this.pool, {
      datasetRowId,
      dataTemplateVersionId: version.dataTemplateVersionId,
      testCaseId: version.testCaseId,
      tenantId: version.tenantId,
      projectId: version.projectId,
    });
    return this.getDatasetRow(datasetRowId);
  }

  async updateDatasetRow(
    datasetRowId: string,
    input: ControlPlaneUpdateDatasetRowInput,
    actor: { subjectId: string },
  ): Promise<ControlPlaneDatasetRowRecord | undefined> {
    const datasetRow = await this.getDatasetRow(datasetRowId);
    if (!datasetRow) {
      return undefined;
    }

    const template = await this.getDataTemplateVersionById(datasetRow.dataTemplateVersionId);
    if (!template) {
      return undefined;
    }

    const nextValues = input.values ? validateDatasetValues(template.schema, input.values) : datasetRow.values;
    const table = this.tableName(datasetRow.tenantId, 'dataset_rows');
    const result = await this.pool.query<DatasetRow>(
      `update ${table}
       set name = coalesce($2, name),
           values_json = $3::jsonb,
           updated_by = $4,
           updated_at = now()
       where dataset_row_id = $1
       returning dataset_row_id, test_case_id, data_template_version_id, tenant_id, project_id,
                 name, status, values_json, created_by, updated_by, created_at, updated_at`,
      [datasetRowId, input.name ?? null, JSON.stringify(nextValues), actor.subjectId],
    );
    return result.rows[0] ? mapDatasetRow(result.rows[0]) : undefined;
  }

  async archiveDatasetRow(
    datasetRowId: string,
    actor: { subjectId: string },
  ): Promise<ControlPlaneDatasetRowRecord | undefined> {
    const datasetRow = await this.getDatasetRow(datasetRowId);
    if (!datasetRow) {
      return undefined;
    }

    const locator = await this.getDatasetRowLocator(datasetRowId);
    if (!locator?.tenant_id) {
      return undefined;
    }

    const bindingsTable = this.tableName(locator.tenant_id, 'case_default_dataset_bindings');
    const bindingResult = await this.pool.query<{ test_case_version_id: string }>(
      `select test_case_version_id
       from ${bindingsTable}
       where dataset_row_id = $1
       limit 1`,
      [datasetRowId],
    );
    if (bindingResult.rows.length > 0) {
      throw new ControlPlaneRequestError(409, 'DEFAULT_DATASET_IN_USE', 'dataset row is currently bound as the default dataset');
    }

    const table = this.tableName(datasetRow.tenantId, 'dataset_rows');
    const result = await this.pool.query<DatasetRow>(
      `update ${table}
       set status = 'archived',
           updated_by = $2,
           updated_at = now()
       where dataset_row_id = $1
       returning dataset_row_id, test_case_id, data_template_version_id, tenant_id, project_id,
                 name, status, values_json, created_by, updated_by, created_at, updated_at`,
      [datasetRowId, actor.subjectId],
    );
    return result.rows[0] ? mapDatasetRow(result.rows[0]) : undefined;
  }

  async bindDefaultDatasetRow(
    testCaseVersionId: string,
    datasetRowId: string,
    actor: { subjectId: string },
  ): Promise<ControlPlaneTestCaseVersionRecord | undefined> {
    const version = await this.getTestCaseVersion(testCaseVersionId);
    if (!version) {
      return undefined;
    }
    const datasetRow = await this.getDatasetRow(datasetRowId);
    if (!datasetRow) {
      return undefined;
    }
    if (datasetRow.dataTemplateVersionId !== version.dataTemplateVersionId) {
      throw new ControlPlaneRequestError(400, 'DATASET_TEMPLATE_MISMATCH', 'dataset row does not belong to the case version template');
    }
    if (datasetRow.status !== 'active') {
      throw new ControlPlaneRequestError(409, 'DATASET_ROW_ARCHIVED', 'dataset row is archived');
    }

    const table = this.tableName(version.tenantId, 'case_default_dataset_bindings');
    await this.pool.query(
      `insert into ${table} (test_case_version_id, dataset_row_id, tenant_id, project_id, bound_at, bound_by)
       values ($1, $2, $3, $4, now(), $5)
       on conflict (test_case_version_id) do update set
         dataset_row_id = excluded.dataset_row_id,
         tenant_id = excluded.tenant_id,
         project_id = excluded.project_id,
         bound_at = now(),
         bound_by = excluded.bound_by`,
      [testCaseVersionId, datasetRowId, version.tenantId, version.projectId, actor.subjectId],
    );
    return this.getTestCaseVersion(testCaseVersionId);
  }

  async enqueueCaseVersionRun(input: ControlPlaneEnqueueCaseVersionRunInput): Promise<ControlPlaneEnqueueWebRunResult> {
    const version = await this.getTestCaseVersion(input.testCaseVersionId);
    if (!version) {
      throw new ControlPlaneRequestError(404, 'TEST_CASE_VERSION_NOT_FOUND', 'test case version not found');
    }
    if (version.tenantId !== input.tenantId || version.projectId !== input.projectId) {
      throw new ControlPlaneRequestError(403, 'CASE_VERSION_SCOPE_MISMATCH', 'test case version does not belong to the requested tenant/project');
    }

    const datasetRow = input.datasetRowId
      ? await this.getDatasetRow(input.datasetRowId)
      : version.defaultDatasetRowId
        ? await this.getDatasetRow(version.defaultDatasetRowId)
        : undefined;
    if (!datasetRow) {
      throw new ControlPlaneRequestError(400, 'DEFAULT_DATASET_MISSING', 'no dataset row is available for the requested case version');
    }
    if (datasetRow.dataTemplateVersionId !== version.dataTemplateVersionId) {
      throw new ControlPlaneRequestError(400, 'DATASET_TEMPLATE_MISMATCH', 'dataset row does not belong to the requested case version');
    }
    if (datasetRow.status !== 'active') {
      throw new ControlPlaneRequestError(409, 'DATASET_ROW_ARCHIVED', 'dataset row is archived');
    }

    const runId = randomUUID();
    const runItemId = randomUUID();
    const jobId = randomUUID();
    const queueEventId = randomUUID();
    const now = new Date().toISOString();
    const workerVariableContext = {
      ...datasetRow.values,
      ...(input.variableContext ?? {}),
    };
    const inputSnapshot = buildExecutionInputSnapshot(
      version.plan,
      version.envProfile,
      datasetRow.values,
      input.variableContext,
    );
    const requiredCapabilities = normalizeCapabilities(
      input.requiredCapabilities ?? buildWebRunRequiredCapabilities(version.plan, version.envProfile),
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
      plan: version.plan,
      envProfile: version.envProfile,
      variableContext: workerVariableContext,
    };

    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const tenantSchema = await this.ensureTenantSchema(input.tenantId, client);
      const runsTable = this.tableName(tenantSchema, 'runs');
      const runItemsTable = this.tableName(tenantSchema, 'run_items');
      await client.query(
        `insert into ${runsTable} (
           run_id, tenant_id, project_id, name, mode, selection_kind, status, last_event_id, created_at, updated_at
         ) values ($1, $2, $3, $4, $5, $6, 'queued', $7, $8, $8)`,
        [
          runId,
          input.tenantId,
          input.projectId,
          input.name,
          input.mode ?? 'standard',
          'case_version',
          queueEventId,
          now,
        ],
      );
      await this.upsertRunLocator(client, runId, input.tenantId, input.projectId);
      await client.query(
        `insert into ${runItemsTable} (
           run_item_id, run_id, job_id, tenant_id, project_id, attempt_no, status, job_kind,
           required_capabilities_json, job_payload_json, test_case_id, test_case_version_id,
           data_template_version_id, dataset_row_id, input_snapshot_json, source_recording_id,
           last_event_id, created_at, updated_at
         ) values (
           $1, $2, $3, $4, $5, 0, 'pending', 'web',
           $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $15
         )`,
        [
          runItemId,
          runId,
          jobId,
          input.tenantId,
          input.projectId,
          JSON.stringify(requiredCapabilities),
          JSON.stringify(job),
          version.testCaseId,
          version.testCaseVersionId,
          version.dataTemplateVersionId,
          datasetRow.datasetRowId,
          JSON.stringify(inputSnapshot),
          version.sourceRecordingId,
          queueEventId,
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
        selectionKind: 'case_version',
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
        testCaseId: version.testCaseId,
        testCaseVersionId: version.testCaseVersionId,
        dataTemplateVersionId: version.dataTemplateVersionId,
        datasetRowId: datasetRow.datasetRowId,
        inputSnapshot,
        sourceRecordingId: version.sourceRecordingId,
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
           selection_kind,
           status,
           last_event_id,
           created_at,
           updated_at
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          runId,
          input.tenantId,
          input.projectId,
          input.name,
          input.mode ?? 'standard',
          'inline_web_plan',
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
        selectionKind: 'inline_web_plan',
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
        `select run_id, tenant_id, project_id, name, mode, selection_kind, status, started_at, finished_at, last_event_id, created_at, updated_at
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
        `select run_id, tenant_id, project_id, name, mode, selection_kind, status, started_at, finished_at, last_event_id, created_at, updated_at
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
        `select run_id, tenant_id, project_id, name, mode, selection_kind, status, started_at, finished_at, last_event_id, created_at, updated_at
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
      `select run_id, tenant_id, project_id, name, mode, selection_kind, status, started_at, finished_at, last_event_id, created_at, updated_at
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
    let sql = `select run_id, tenant_id, project_id, name, mode, selection_kind, status, started_at, finished_at, last_event_id, created_at, updated_at
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
              required_capabilities_json, test_case_id, test_case_version_id, data_template_version_id, dataset_row_id,
              input_snapshot_json, source_recording_id, assigned_agent_id, lease_token, control_state, control_reason,
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
                      required_capabilities_json, test_case_id, test_case_version_id, data_template_version_id, dataset_row_id,
                      input_snapshot_json, source_recording_id, assigned_agent_id, lease_token, control_state, control_reason,
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
      if (!this.ensuredTenantSchemas.has(existing)) {
        await this.reconcileTenantSchema(existing, executor);
        this.ensuredTenantSchemas.add(existing);
      }
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
    await this.reconcileTenantSchema(tenantId, executor);
    this.ensuredTenantSchemas.add(tenantId);
    return tenantId;
  }

  private async reconcileExistingTenantSchemas(): Promise<void> {
    const tenantIds = await this.listTenantSchemas().catch(() => []);
    for (const tenantId of tenantIds) {
      await this.reconcileTenantSchema(tenantId, this.pool);
      this.ensuredTenantSchemas.add(tenantId);
    }
  }

  private async reconcileTenantSchema(
    tenantSchema: string,
    executor: SqlPoolLike | SqlPoolClientLike,
  ): Promise<void> {
    await executor.query(buildTenantBusinessSchemaSql(tenantSchema));

    const runsTable = this.tableName(tenantSchema, 'runs');
    const runItemsTable = this.tableName(tenantSchema, 'run_items');

    await executor.query(
      `alter table ${runsTable}
       add column if not exists selection_kind text null`,
    );
    await executor.query(
      `alter table ${runItemsTable}
       add column if not exists test_case_id uuid null,
       add column if not exists test_case_version_id uuid null,
       add column if not exists data_template_version_id uuid null,
       add column if not exists dataset_row_id uuid null,
       add column if not exists input_snapshot_json jsonb not null default '{}'::jsonb,
       add column if not exists source_recording_id uuid null`,
    );
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

  private async getRecordingLocator(
    recordingId: string,
    executor: SqlPoolLike | SqlPoolClientLike = this.pool,
  ): Promise<EntityLocatorRow | undefined> {
    const result = await executor.query<EntityLocatorRow>(
      `select tenant_id, project_id, recording_id
       from recording_locators
       where recording_id = $1
       limit 1`,
      [recordingId],
    );
    return result.rows[0];
  }

  private async getTestCaseLocator(
    testCaseId: string,
    executor: SqlPoolLike | SqlPoolClientLike = this.pool,
  ): Promise<EntityLocatorRow | undefined> {
    const result = await executor.query<EntityLocatorRow>(
      `select tenant_id, project_id, test_case_id
       from test_case_locators
       where test_case_id = $1
       limit 1`,
      [testCaseId],
    );
    return result.rows[0];
  }

  private async getTestCaseVersionLocator(
    testCaseVersionId: string,
    executor: SqlPoolLike | SqlPoolClientLike = this.pool,
  ): Promise<EntityLocatorRow | undefined> {
    const result = await executor.query<EntityLocatorRow>(
      `select tenant_id, project_id, test_case_id, test_case_version_id
       from test_case_version_locators
       where test_case_version_id = $1
       limit 1`,
      [testCaseVersionId],
    );
    return result.rows[0];
  }

  private async getDataTemplateVersionLocator(
    dataTemplateVersionId: string,
    executor: SqlPoolLike | SqlPoolClientLike = this.pool,
  ): Promise<EntityLocatorRow | undefined> {
    const result = await executor.query<EntityLocatorRow>(
      `select tenant_id, project_id, test_case_id, data_template_id, data_template_version_id
       from data_template_version_locators
       where data_template_version_id = $1
       limit 1`,
      [dataTemplateVersionId],
    );
    return result.rows[0];
  }

  private async getDatasetRowLocator(
    datasetRowId: string,
    executor: SqlPoolLike | SqlPoolClientLike = this.pool,
  ): Promise<EntityLocatorRow | undefined> {
    const result = await executor.query<EntityLocatorRow>(
      `select tenant_id, project_id, test_case_id, data_template_version_id, dataset_row_id
       from dataset_row_locators
       where dataset_row_id = $1
       limit 1`,
      [datasetRowId],
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

  private async upsertRecordingLocator(
    executor: SqlPoolLike | SqlPoolClientLike,
    input: { recordingId: string; tenantId: string; projectId: string },
  ): Promise<void> {
    await executor.query(
      `insert into recording_locators (recording_id, tenant_id, project_id)
       values ($1, $2, $3)
       on conflict (recording_id) do update set
         tenant_id = excluded.tenant_id,
         project_id = excluded.project_id,
         updated_at = now()`,
      [input.recordingId, input.tenantId, input.projectId],
    );
  }

  private async upsertTestCaseLocator(
    executor: SqlPoolLike | SqlPoolClientLike,
    input: { testCaseId: string; tenantId: string; projectId: string },
  ): Promise<void> {
    await executor.query(
      `insert into test_case_locators (test_case_id, tenant_id, project_id)
       values ($1, $2, $3)
       on conflict (test_case_id) do update set
         tenant_id = excluded.tenant_id,
         project_id = excluded.project_id,
         updated_at = now()`,
      [input.testCaseId, input.tenantId, input.projectId],
    );
  }

  private async upsertTestCaseVersionLocator(
    executor: SqlPoolLike | SqlPoolClientLike,
    input: { testCaseVersionId: string; testCaseId: string; tenantId: string; projectId: string },
  ): Promise<void> {
    await executor.query(
      `insert into test_case_version_locators (test_case_version_id, test_case_id, tenant_id, project_id)
       values ($1, $2, $3, $4)
       on conflict (test_case_version_id) do update set
         test_case_id = excluded.test_case_id,
         tenant_id = excluded.tenant_id,
         project_id = excluded.project_id,
         updated_at = now()`,
      [input.testCaseVersionId, input.testCaseId, input.tenantId, input.projectId],
    );
  }

  private async upsertDataTemplateLocator(
    executor: SqlPoolLike | SqlPoolClientLike,
    input: { dataTemplateId: string; testCaseId: string; tenantId: string; projectId: string },
  ): Promise<void> {
    await executor.query(
      `insert into data_template_locators (data_template_id, test_case_id, tenant_id, project_id)
       values ($1, $2, $3, $4)
       on conflict (data_template_id) do update set
         test_case_id = excluded.test_case_id,
         tenant_id = excluded.tenant_id,
         project_id = excluded.project_id,
         updated_at = now()`,
      [input.dataTemplateId, input.testCaseId, input.tenantId, input.projectId],
    );
  }

  private async upsertDataTemplateVersionLocator(
    executor: SqlPoolLike | SqlPoolClientLike,
    input: {
      dataTemplateVersionId: string;
      dataTemplateId: string;
      testCaseId: string;
      tenantId: string;
      projectId: string;
    },
  ): Promise<void> {
    await executor.query(
      `insert into data_template_version_locators (
         data_template_version_id, data_template_id, test_case_id, tenant_id, project_id
       ) values ($1, $2, $3, $4, $5)
       on conflict (data_template_version_id) do update set
         data_template_id = excluded.data_template_id,
         test_case_id = excluded.test_case_id,
         tenant_id = excluded.tenant_id,
         project_id = excluded.project_id,
         updated_at = now()`,
      [input.dataTemplateVersionId, input.dataTemplateId, input.testCaseId, input.tenantId, input.projectId],
    );
  }

  private async upsertDatasetRowLocator(
    executor: SqlPoolLike | SqlPoolClientLike,
    input: {
      datasetRowId: string;
      dataTemplateVersionId: string;
      testCaseId: string;
      tenantId: string;
      projectId: string;
    },
  ): Promise<void> {
    await executor.query(
      `insert into dataset_row_locators (dataset_row_id, data_template_version_id, test_case_id, tenant_id, project_id)
       values ($1, $2, $3, $4, $5)
       on conflict (dataset_row_id) do update set
         data_template_version_id = excluded.data_template_version_id,
         test_case_id = excluded.test_case_id,
         tenant_id = excluded.tenant_id,
         project_id = excluded.project_id,
         updated_at = now()`,
      [input.datasetRowId, input.dataTemplateVersionId, input.testCaseId, input.tenantId, input.projectId],
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

  private async getTestCaseVersionForUpdate(
    client: SqlPoolClientLike,
    tenantSchema: string,
    testCaseVersionId: string,
  ): Promise<ControlPlaneTestCaseVersionRecord | undefined> {
    const versionsTable = this.tableName(tenantSchema, 'test_case_versions');
    const bindingsTable = this.tableName(tenantSchema, 'case_default_dataset_bindings');
    const result = await client.query<TestCaseVersionRow>(
      `select version.test_case_version_id, version.test_case_id, version.tenant_id, version.project_id,
              version.version_no, version.version_label, version.status, version.plan_json, version.env_profile_json,
              version.data_template_id, version.data_template_version_id, binding.dataset_row_id as default_dataset_row_id,
              version.source_recording_id, version.source_run_id, version.derived_from_case_version_id,
              version.change_summary, version.created_by, version.created_at
       from ${versionsTable} version
       left join ${bindingsTable} binding
         on binding.test_case_version_id = version.test_case_version_id
       where version.test_case_version_id = $1
       limit 1
       for update of version`,
      [testCaseVersionId],
    );
    return result.rows[0] ? mapTestCaseVersion(result.rows[0]) : undefined;
  }

  private async getDataTemplateVersionById(
    dataTemplateVersionId: string,
  ): Promise<ControlPlaneDataTemplateVersionRecord | undefined> {
    const locator = await this.getDataTemplateVersionLocator(dataTemplateVersionId);
    if (!locator?.tenant_id) {
      return undefined;
    }

    const table = this.tableName(locator.tenant_id, 'data_template_versions');
    const result = await this.pool.query<DataTemplateVersionRow>(
      `select data_template_id, data_template_version_id, test_case_id, tenant_id, project_id,
              version_no, schema_json, validation_rules_json, null::text as default_dataset_row_id,
              created_by, created_at
       from ${table}
       where data_template_version_id = $1
       limit 1`,
      [dataTemplateVersionId],
    );
    return result.rows[0] ? mapDataTemplateVersion(result.rows[0]) : undefined;
  }

  async getDatasetRow(datasetRowId: string): Promise<ControlPlaneDatasetRowRecord | undefined> {
    const locator = await this.getDatasetRowLocator(datasetRowId);
    if (!locator?.tenant_id) {
      return undefined;
    }

    const table = this.tableName(locator.tenant_id, 'dataset_rows');
    const result = await this.pool.query<DatasetRow>(
      `select dataset_row_id, test_case_id, data_template_version_id, tenant_id, project_id,
              name, status, values_json, created_by, updated_by, created_at, updated_at
       from ${table}
       where dataset_row_id = $1
       limit 1`,
      [datasetRowId],
    );
    return result.rows[0] ? mapDatasetRow(result.rows[0]) : undefined;
  }

  private async listRecordingEvents(recordingId: string): Promise<RecordingEventRow[]> {
    const recording = await this.getRecording(recordingId);
    if (!recording) {
      return [];
    }

    const table = this.tableName(recording.tenantId, 'recording_events');
    const result = await this.pool.query<RecordingEventRow>(
      `select recording_event_id, recording_id, seq_no, event_type, page_url, locator_json, payload_json, captured_at
       from ${table}
       where recording_id = $1
       order by seq_no asc`,
      [recordingId],
    );
    return result.rows;
  }

  private async getRecordingAnalysisJob(
    recordingId: string,
    recordingAnalysisJobId: string,
  ): Promise<ControlPlaneRecordingAnalysisJobRecord | undefined> {
    const recording = await this.getRecording(recordingId);
    if (!recording) {
      return undefined;
    }

    const table = this.tableName(recording.tenantId, 'recording_analysis_jobs');
    const result = await this.pool.query<RecordingAnalysisJobRow>(
      `select recording_analysis_job_id, recording_id, tenant_id, project_id, status, dsl_plan_json,
              structured_plan_json, data_template_draft_json, started_at, finished_at, created_by, created_at
       from ${table}
       where recording_id = $1
         and recording_analysis_job_id = $2
       limit 1`,
      [recordingId, recordingAnalysisJobId],
    );
    return result.rows[0] ? mapRecordingAnalysisJob(result.rows[0]) : undefined;
  }

  private async getLatestRecordingAnalysisJob(
    recordingId: string,
  ): Promise<ControlPlaneRecordingAnalysisJobRecord | undefined> {
    const recording = await this.getRecording(recordingId);
    if (!recording) {
      return undefined;
    }

    const table = this.tableName(recording.tenantId, 'recording_analysis_jobs');
    const result = await this.pool.query<RecordingAnalysisJobRow>(
      `select recording_analysis_job_id, recording_id, tenant_id, project_id, status, dsl_plan_json,
              structured_plan_json, data_template_draft_json, started_at, finished_at, created_by, created_at
       from ${table}
       where recording_id = $1
       order by created_at desc, recording_analysis_job_id desc
       limit 1`,
      [recordingId],
    );
    return result.rows[0] ? mapRecordingAnalysisJob(result.rows[0]) : undefined;
  }

  private async getRunItemForDerivation(runItemId: string): Promise<DerivableRunItemRow | undefined> {
    const locator = await this.getRunItemLocatorByRunItemId(runItemId);
    if (!locator?.tenant_id) {
      return undefined;
    }

    const table = this.tableName(locator.tenant_id, 'run_items');
    const result = await this.pool.query<DerivableRunItemRow>(
      `select run_item_id, run_id, tenant_id, project_id, status, test_case_id, test_case_version_id,
              input_snapshot_json, source_recording_id, job_payload_json
       from ${table}
       where run_item_id = $1
       limit 1`,
      [runItemId],
    );
    return result.rows[0];
  }

  private async insertNewTestCaseBundle(
    client: SqlPoolClientLike,
    tenantSchema: string,
    input: ControlPlaneCreateTestCaseInput,
    actor: { subjectId: string },
  ): Promise<ControlPlaneCreateTestCaseResult> {
    const testCasesTable = this.tableName(tenantSchema, 'test_cases');
    const dataTemplatesTable = this.tableName(tenantSchema, 'data_templates');
    const dataTemplateVersionsTable = this.tableName(tenantSchema, 'data_template_versions');
    const versionsTable = this.tableName(tenantSchema, 'test_case_versions');
    const datasetRowsTable = this.tableName(tenantSchema, 'dataset_rows');
    const bindingsTable = this.tableName(tenantSchema, 'case_default_dataset_bindings');
    const now = new Date().toISOString();
    const testCaseId = randomUUID();
    const dataTemplateId = randomUUID();
    const dataTemplateVersionId = randomUUID();
    const testCaseVersionId = randomUUID();
    const datasetRowId = randomUUID();
    const schema = deriveTemplateSchemaFromPlan(input.plan, input.defaultDataset?.values);
    const defaultValues = ensureDefaultDatasetValues(schema, input.defaultDataset?.values);
    const versionStatus = input.publish ? 'published' : 'draft';
    const caseStatus = input.publish ? 'active' : 'draft';

    await client.query(
      `insert into ${testCasesTable} (
         test_case_id, tenant_id, project_id, data_template_id, name, status,
         latest_version_id, latest_published_version_id, created_by, updated_by, created_at, updated_at
       ) values (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $10
       )`,
      [
        testCaseId,
        input.tenantId,
        input.projectId,
        dataTemplateId,
        input.name,
        caseStatus,
        testCaseVersionId,
        input.publish ? testCaseVersionId : null,
        actor.subjectId,
        now,
      ],
    );
    await client.query(
      `insert into ${dataTemplatesTable} (
         data_template_id, test_case_id, tenant_id, project_id, name, status, latest_version_id, created_at, updated_at
       ) values ($1, $2, $3, $4, $5, 'active', $6, $7, $7)`,
      [
        dataTemplateId,
        testCaseId,
        input.tenantId,
        input.projectId,
        `${input.name} template`,
        dataTemplateVersionId,
        now,
      ],
    );
    await client.query(
      `insert into ${dataTemplateVersionsTable} (
         data_template_version_id, data_template_id, test_case_id, tenant_id, project_id,
         version_no, schema_json, validation_rules_json, created_by, created_at
       ) values ($1, $2, $3, $4, $5, 1, $6::jsonb, $7::jsonb, $8, $9)`,
      [
        dataTemplateVersionId,
        dataTemplateId,
        testCaseId,
        input.tenantId,
        input.projectId,
        JSON.stringify(schema),
        JSON.stringify({ allow_extra_fields: false }),
        actor.subjectId,
        now,
      ],
    );
    await client.query(
      `insert into ${versionsTable} (
         test_case_version_id, test_case_id, tenant_id, project_id, version_no, version_label, status,
         plan_json, env_profile_json, data_template_id, data_template_version_id,
         source_recording_id, source_run_id, derived_from_case_version_id, change_summary, created_by, created_at
       ) values (
         $1, $2, $3, $4, 1, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13, $14, $15, $16
       )`,
      [
        testCaseVersionId,
        testCaseId,
        input.tenantId,
        input.projectId,
        input.versionLabel ?? 'v1',
        versionStatus,
        JSON.stringify(input.plan),
        JSON.stringify(input.envProfile),
        dataTemplateId,
        dataTemplateVersionId,
        input.sourceRecordingId ?? null,
        input.sourceRunId ?? null,
        input.derivedFromCaseVersionId ?? null,
        input.changeSummary ?? null,
        actor.subjectId,
        now,
      ],
    );
    await client.query(
      `insert into ${datasetRowsTable} (
         dataset_row_id, data_template_version_id, test_case_id, tenant_id, project_id, name, status, values_json,
         created_by, updated_by, created_at, updated_at
       ) values ($1, $2, $3, $4, $5, $6, 'active', $7::jsonb, $8, $8, $9, $9)`,
      [
        datasetRowId,
        dataTemplateVersionId,
        testCaseId,
        input.tenantId,
        input.projectId,
        input.defaultDataset?.name ?? 'default',
        JSON.stringify(defaultValues),
        actor.subjectId,
        now,
      ],
    );
    await client.query(
      `insert into ${bindingsTable} (test_case_version_id, dataset_row_id, tenant_id, project_id, bound_at, bound_by)
       values ($1, $2, $3, $4, $5, $6)`,
      [testCaseVersionId, datasetRowId, input.tenantId, input.projectId, now, actor.subjectId],
    );

    await this.upsertTestCaseLocator(client, { testCaseId, tenantId: input.tenantId, projectId: input.projectId });
    await this.upsertDataTemplateLocator(client, { dataTemplateId, testCaseId, tenantId: input.tenantId, projectId: input.projectId });
    await this.upsertDataTemplateVersionLocator(client, {
      dataTemplateVersionId,
      dataTemplateId,
      testCaseId,
      tenantId: input.tenantId,
      projectId: input.projectId,
    });
    await this.upsertTestCaseVersionLocator(client, {
      testCaseVersionId,
      testCaseId,
      tenantId: input.tenantId,
      projectId: input.projectId,
    });
    await this.upsertDatasetRowLocator(client, {
      datasetRowId,
      dataTemplateVersionId,
      testCaseId,
      tenantId: input.tenantId,
      projectId: input.projectId,
    });

    return {
      testCase: {
        testCaseId,
        tenantId: input.tenantId,
        projectId: input.projectId,
        dataTemplateId,
        name: input.name,
        status: caseStatus,
        latestVersionId: testCaseVersionId,
        latestPublishedVersionId: input.publish ? testCaseVersionId : null,
        createdBy: actor.subjectId,
        updatedBy: actor.subjectId,
        createdAt: now,
        updatedAt: now,
      },
      version: {
        testCaseVersionId,
        testCaseId,
        tenantId: input.tenantId,
        projectId: input.projectId,
        versionNo: 1,
        versionLabel: input.versionLabel ?? 'v1',
        status: versionStatus,
        plan: input.plan,
        envProfile: input.envProfile,
        dataTemplateId,
        dataTemplateVersionId,
        defaultDatasetRowId: datasetRowId,
        sourceRecordingId: input.sourceRecordingId ?? null,
        sourceRunId: input.sourceRunId ?? null,
        derivedFromCaseVersionId: input.derivedFromCaseVersionId ?? null,
        changeSummary: input.changeSummary ?? null,
        createdBy: actor.subjectId,
        createdAt: now,
      },
      dataTemplateVersion: {
        dataTemplateId,
        dataTemplateVersionId,
        testCaseId,
        tenantId: input.tenantId,
        projectId: input.projectId,
        versionNo: 1,
        schema,
        validationRules: { allow_extra_fields: false },
        defaultDatasetRowId: datasetRowId,
        createdBy: actor.subjectId,
        createdAt: now,
      },
      defaultDatasetRow: {
        datasetRowId,
        testCaseId,
        dataTemplateVersionId,
        tenantId: input.tenantId,
        projectId: input.projectId,
        name: input.defaultDataset?.name ?? 'default',
        status: 'active',
        values: defaultValues,
        createdBy: actor.subjectId,
        updatedBy: actor.subjectId,
        createdAt: now,
        updatedAt: now,
      },
    };
  }

  private async insertAdditionalTestCaseVersionBundle(
    client: SqlPoolClientLike,
    tenantSchema: string,
    testCaseId: string,
    input: ControlPlaneCreateTestCaseVersionInput,
    actor: { subjectId: string },
  ): Promise<ControlPlaneCreateTestCaseVersionResult> {
    const testCasesTable = this.tableName(tenantSchema, 'test_cases');
    const dataTemplatesTable = this.tableName(tenantSchema, 'data_templates');
    const dataTemplateVersionsTable = this.tableName(tenantSchema, 'data_template_versions');
    const versionsTable = this.tableName(tenantSchema, 'test_case_versions');
    const datasetRowsTable = this.tableName(tenantSchema, 'dataset_rows');
    const bindingsTable = this.tableName(tenantSchema, 'case_default_dataset_bindings');
    const caseResult = await client.query<TestCaseRow>(
      `select test_case_id, tenant_id, project_id, data_template_id, name, status,
              latest_version_id, latest_published_version_id, created_by, updated_by, created_at, updated_at
       from ${testCasesTable}
       where test_case_id = $1
       limit 1
       for update`,
      [testCaseId],
    );
    if (caseResult.rows.length === 0) {
      throw new ControlPlaneRequestError(404, 'TEST_CASE_NOT_FOUND', 'test case not found');
    }
    const testCase = mapTestCase(caseResult.rows[0]);
    const nextVersionNoResult = await client.query<{ next_version_no: number }>(
      `select coalesce(max(version_no), 0)::int + 1 as next_version_no
       from ${versionsTable}
       where test_case_id = $1`,
      [testCaseId],
    );
    const nextVersionNo = nextVersionNoResult.rows[0]?.next_version_no ?? 1;
    const dataTemplateVersionNoResult = await client.query<{ next_version_no: number }>(
      `select coalesce(max(version_no), 0)::int + 1 as next_version_no
       from ${dataTemplateVersionsTable}
       where data_template_id = $1`,
      [testCase.dataTemplateId],
    );
    const nextTemplateVersionNo = dataTemplateVersionNoResult.rows[0]?.next_version_no ?? 1;
    const latestDefaultRow = testCase.latestVersionId
      ? await this.getTestCaseVersion(testCase.latestVersionId)
      : undefined;
    const inheritedDefaultValues = latestDefaultRow?.defaultDatasetRowId
      ? (await this.getDatasetRow(latestDefaultRow.defaultDatasetRowId))?.values
      : undefined;
    const schema = deriveTemplateSchemaFromPlan(input.plan, input.defaultDataset?.values ?? inheritedDefaultValues ?? {});
    const defaultValues = input.defaultDataset?.values
      ? ensureDefaultDatasetValues(schema, input.defaultDataset.values)
      : inheritedDefaultValues
        ? validateDatasetValues(schema, inheritedDefaultValues)
        : ensureDefaultDatasetValues(schema, undefined);
    const now = new Date().toISOString();
    const testCaseVersionId = randomUUID();
    const dataTemplateVersionId = randomUUID();
    const datasetRowId = randomUUID();
    const versionStatus = input.publish ? 'published' : 'draft';

    await client.query(
      `insert into ${dataTemplateVersionsTable} (
         data_template_version_id, data_template_id, test_case_id, tenant_id, project_id,
         version_no, schema_json, validation_rules_json, created_by, created_at
       ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)`,
      [
        dataTemplateVersionId,
        testCase.dataTemplateId,
        testCaseId,
        testCase.tenantId,
        testCase.projectId,
        nextTemplateVersionNo,
        JSON.stringify(schema),
        JSON.stringify({ allow_extra_fields: false }),
        actor.subjectId,
        now,
      ],
    );
    await client.query(
      `update ${dataTemplatesTable}
       set latest_version_id = $2,
           updated_at = now()
       where data_template_id = $1`,
      [testCase.dataTemplateId, dataTemplateVersionId],
    );
    await client.query(
      `insert into ${versionsTable} (
         test_case_version_id, test_case_id, tenant_id, project_id, version_no, version_label, status,
         plan_json, env_profile_json, data_template_id, data_template_version_id,
         source_recording_id, source_run_id, derived_from_case_version_id, change_summary, created_by, created_at
       ) values (
         $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11,
         $12, $13, $14, $15, $16, $17
       )`,
      [
        testCaseVersionId,
        testCaseId,
        testCase.tenantId,
        testCase.projectId,
        nextVersionNo,
        input.versionLabel ?? `v${nextVersionNo}`,
        versionStatus,
        JSON.stringify(input.plan),
        JSON.stringify(input.envProfile),
        testCase.dataTemplateId,
        dataTemplateVersionId,
        input.sourceRecordingId ?? null,
        input.sourceRunId ?? null,
        input.derivedFromCaseVersionId ?? testCase.latestVersionId,
        input.changeSummary ?? null,
        actor.subjectId,
        now,
      ],
    );
    await client.query(
      `insert into ${datasetRowsTable} (
         dataset_row_id, data_template_version_id, test_case_id, tenant_id, project_id, name, status, values_json,
         created_by, updated_by, created_at, updated_at
       ) values ($1, $2, $3, $4, $5, $6, 'active', $7::jsonb, $8, $8, $9, $9)`,
      [
        datasetRowId,
        dataTemplateVersionId,
        testCaseId,
        testCase.tenantId,
        testCase.projectId,
        input.defaultDataset?.name ?? 'default',
        JSON.stringify(defaultValues),
        actor.subjectId,
        now,
      ],
    );
    await client.query(
      `insert into ${bindingsTable} (test_case_version_id, dataset_row_id, tenant_id, project_id, bound_at, bound_by)
       values ($1, $2, $3, $4, $5, $6)`,
      [testCaseVersionId, datasetRowId, testCase.tenantId, testCase.projectId, now, actor.subjectId],
    );
    await client.query(
      `update ${testCasesTable}
       set latest_version_id = $2,
           latest_published_version_id = case when $3 then $2 else latest_published_version_id end,
           status = case when $3 then 'active' else status end,
           updated_by = $4,
           updated_at = now()
       where test_case_id = $1`,
      [testCaseId, testCaseVersionId, input.publish === true, actor.subjectId],
    );

    await this.upsertDataTemplateVersionLocator(client, {
      dataTemplateVersionId,
      dataTemplateId: testCase.dataTemplateId,
      testCaseId,
      tenantId: testCase.tenantId,
      projectId: testCase.projectId,
    });
    await this.upsertTestCaseVersionLocator(client, {
      testCaseVersionId,
      testCaseId,
      tenantId: testCase.tenantId,
      projectId: testCase.projectId,
    });
    await this.upsertDatasetRowLocator(client, {
      datasetRowId,
      dataTemplateVersionId,
      testCaseId,
      tenantId: testCase.tenantId,
      projectId: testCase.projectId,
    });

    return {
      testCase: {
        ...testCase,
        status: input.publish ? 'active' : testCase.status,
        latestVersionId: testCaseVersionId,
        latestPublishedVersionId: input.publish ? testCaseVersionId : testCase.latestPublishedVersionId,
        updatedBy: actor.subjectId,
        updatedAt: now,
      },
      version: {
        testCaseVersionId,
        testCaseId,
        tenantId: testCase.tenantId,
        projectId: testCase.projectId,
        versionNo: nextVersionNo,
        versionLabel: input.versionLabel ?? `v${nextVersionNo}`,
        status: versionStatus,
        plan: input.plan,
        envProfile: input.envProfile,
        dataTemplateId: testCase.dataTemplateId,
        dataTemplateVersionId,
        defaultDatasetRowId: datasetRowId,
        sourceRecordingId: input.sourceRecordingId ?? null,
        sourceRunId: input.sourceRunId ?? null,
        derivedFromCaseVersionId: input.derivedFromCaseVersionId ?? testCase.latestVersionId,
        changeSummary: input.changeSummary ?? null,
        createdBy: actor.subjectId,
        createdAt: now,
      },
      dataTemplateVersion: {
        dataTemplateId: testCase.dataTemplateId,
        dataTemplateVersionId,
        testCaseId,
        tenantId: testCase.tenantId,
        projectId: testCase.projectId,
        versionNo: nextTemplateVersionNo,
        schema,
        validationRules: { allow_extra_fields: false },
        defaultDatasetRowId: datasetRowId,
        createdBy: actor.subjectId,
        createdAt: now,
      },
      defaultDatasetRow: {
        datasetRowId,
        testCaseId,
        dataTemplateVersionId,
        tenantId: testCase.tenantId,
        projectId: testCase.projectId,
        name: input.defaultDataset?.name ?? 'default',
        status: 'active',
        values: defaultValues,
        createdBy: actor.subjectId,
        updatedBy: actor.subjectId,
        createdAt: now,
        updatedAt: now,
      },
    };
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

      const artifactRef = artifact as ArtifactReference;
      const artifactId = artifactRef.artifactId ?? randomUUID();

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
          artifactRef.kind,
          artifactRef.uri,
          artifactRef.contentType ?? null,
          artifactRef.sizeBytes ?? null,
          artifactRef.sha256 ?? null,
          JSON.stringify(artifactRef.metadata ?? {}),
          resolveArtifactRetentionExpiresAt(artifactRef),
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
