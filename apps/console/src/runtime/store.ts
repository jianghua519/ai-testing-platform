import { Pool } from 'pg';

export interface ProjectScope {
  tenantId: string;
  projectId: string;
  label: string;
}

export interface PageWindow {
  page: number;
  pageSize: number;
}

export interface PageResult<T> {
  items: T[];
  hasNext: boolean;
  hasPrevious: boolean;
  page: number;
}

export interface StatusCount {
  value: string;
  count: number;
}

export interface OverviewData {
  testCaseCount: number;
  testCaseStatuses: StatusCount[];
  recordingCount: number;
  recordingAnalysisCount: number;
  recordingAnalysisStatuses: StatusCount[];
  runCount: number;
  activeRunCount: number;
  failedRunCount: number;
  threadCount: number;
  explorationCount: number;
  explorationStatuses: StatusCount[];
  artifactCount: number;
  artifactBytes: number;
  artifactTypes: StatusCount[];
}

export interface SystemStatus {
  onlineAgents: number;
  queuedItems: number;
}

export interface TestCaseListItem {
  id: string;
  name: string;
  status: string;
  latestVersionId: string | null;
  updatedAt: string;
}

export interface TestCaseVersionSummary {
  id: string;
  versionNo: number;
  versionLabel: string | null;
  status: string;
  envProfile: Record<string, unknown>;
  plan: Record<string, unknown>;
  dataTemplateVersionId: string;
  defaultDatasetRowId: string | null;
  sourceRecordingId: string | null;
  sourceRunId: string | null;
  changeSummary: string | null;
  createdAt: string;
}

export interface DatasetRowSummary {
  id: string;
  name: string;
  status: string;
  values: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DataTemplateSummary {
  id: string;
  versionId: string;
  schema: Record<string, unknown>;
  validationRules: Record<string, unknown>;
}

export interface RelatedRunSummary {
  id: string;
  name: string | null;
  status: string;
  updatedAt: string;
}

export interface TestCaseDetail {
  id: string;
  name: string;
  status: string;
  latestVersionId: string | null;
  latestPublishedVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  versions: TestCaseVersionSummary[];
  dataTemplate: DataTemplateSummary | null;
  datasetRows: DatasetRowSummary[];
  latestRun: RelatedRunSummary | null;
}

export interface RecordingListItem {
  id: string;
  name: string;
  status: string;
  sourceType: string;
  updatedAt: string;
}

export interface RecordingEventSummary {
  id: string;
  seqNo: number;
  eventType: string;
  pageUrl: string | null;
  payload: Record<string, unknown>;
  capturedAt: string;
}

export interface RecordingAnalysisSummary {
  id: string;
  status: string;
  createdAt: string;
  startedAt: string;
  finishedAt: string | null;
}

export interface RecordingDerivedCaseSummary {
  testCaseId: string;
  versionId: string;
  caseName: string;
  versionLabel: string | null;
  status: string;
  createdAt: string;
}

export interface RecordingDetail {
  id: string;
  name: string;
  status: string;
  sourceType: string;
  envProfile: Record<string, unknown>;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  events: RecordingEventSummary[];
  analysisJobs: RecordingAnalysisSummary[];
  derivedCases: RecordingDerivedCaseSummary[];
}

export interface RunListItem {
  id: string;
  name: string | null;
  status: string;
  selectionKind: string | null;
  updatedAt: string;
}

export interface RunItemSummary {
  id: string;
  status: string;
  attemptNo: number;
  jobKind: string;
  testCaseVersionId: string | null;
  datasetRowId: string | null;
  assignedAgentId: string | null;
  jobId: string;
}

export interface StepEventSummary {
  id: string;
  sourceStepId: string;
  status: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  errorCode: string | null;
}

export interface ArtifactSummary {
  id: string;
  artifactType: string;
  contentType: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

export interface SelfHealAttemptSummary {
  id: string;
  status: string;
  explanation: string | null;
  replayRunId: string | null;
  replayRunStatus: string | null;
  derivedTestCaseVersionId: string | null;
  createdAt: string;
}

export interface RunEvaluationSummary {
  id: string;
  verdict: string;
  explanation: string;
  linkedArtifactIds: string[];
  selfHealAttemptId: string | null;
  createdAt: string;
}

export interface RunDetail {
  id: string;
  name: string | null;
  status: string;
  mode: string | null;
  selectionKind: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  lastEventId: string;
  updatedAt: string;
  runItems: RunItemSummary[];
  selectedRunItemId: string | null;
  stepEvents: StepEventSummary[];
  artifacts: ArtifactSummary[];
  selfHealAttempts: SelfHealAttemptSummary[];
  runEvaluations: RunEvaluationSummary[];
}

export interface ThreadListItem {
  id: string;
  title: string | null;
  messageCount: number;
  factCount: number;
  updatedAt: string;
}

export interface AssistantMessageSummary {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

export interface MemoryFactSummary {
  id: string;
  content: string;
  confidence: number;
  createdAt: string;
}

export interface ExplorationReference {
  id: string;
  name: string | null;
  status: string;
  updatedAt: string;
}

export interface ThreadDetail {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messages: AssistantMessageSummary[];
  facts: MemoryFactSummary[];
  explorations: ExplorationReference[];
}

export interface ExplorationListItem {
  id: string;
  name: string | null;
  status: string;
  startUrl: string;
  recordingId: string | null;
  updatedAt: string;
}

export interface ExplorationArtifactSummary {
  kind: string;
  path: string;
  sizeBytes: number | null;
}

export interface ExplorationDetail {
  id: string;
  threadId: string | null;
  name: string | null;
  status: string;
  executionMode: string;
  instruction: string;
  startUrl: string;
  recordingId: string | null;
  summary: string | null;
  lastSnapshotMarkdown: string | null;
  sampleDataset: Record<string, unknown>;
  createdTestCaseId: string | null;
  createdTestCaseVersionId: string | null;
  defaultDatasetRowId: string | null;
  artifacts: ExplorationArtifactSummary[];
  createdAt: string;
  updatedAt: string;
}

const quoteIdentifier = (value: string): string => `"${value.replace(/"/g, '""')}"`;

const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (match) => `\\${match}`);

const normalizePage = (page: number | undefined): number => {
  if (!Number.isInteger(page) || !page || page < 1) {
    return 1;
  }
  return page;
};

const readJsonRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

const readJsonArray = <T>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : []);

const countByValue = async (
  pool: Pool,
  schema: string,
  table: string,
  projectId: string,
  column: string,
): Promise<StatusCount[]> => {
  const result = await pool.query<{ value: string; count: string }>(
    `select ${column} as value, count(*)::text as count
       from ${schema}.${table}
      where project_id = $1
      group by ${column}
      order by count(*) desc, ${column} asc`,
    [projectId],
  );
  return result.rows.map((row) => ({ value: row.value, count: Number(row.count) }));
};

export class ConsoleStore {
  readonly #pool: Pool;

  constructor(connectionString: string) {
    this.#pool = new Pool({ connectionString });
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }

  async listProjectScopes(): Promise<ProjectScope[]> {
    const result = await this.#pool.query<{ tenant_id: string; project_id: string }>(
      `with project_pairs as (
         select tenant_id, project_id from run_locators
         union
         select tenant_id, project_id from recording_locators
         union
         select tenant_id, project_id from test_case_locators
         union
         select tenant_id, project_id from assistant_thread_locators
         union
         select tenant_id, project_id from exploration_session_locators
       )
       select tenant_id, project_id
         from project_pairs
        order by tenant_id asc, project_id asc`,
    );

    return result.rows.map((row) => ({
      tenantId: row.tenant_id,
      projectId: row.project_id,
      label: `${row.tenant_id} / ${row.project_id}`,
    }));
  }

  async ensureProjectMembership(subjectId: string, tenantId: string, projectId: string): Promise<void> {
    await this.#pool.query(
      `insert into subject_project_memberships (tenant_id, subject_id, project_id, roles_json, status)
       values ($1, $2, $3, '["operator","qa","developer"]'::jsonb, 'active')
       on conflict (tenant_id, subject_id, project_id) do update set
         roles_json = excluded.roles_json,
         status = 'active',
         updated_at = now()`,
      [tenantId, subjectId, projectId],
    );
  }

  async updateThreadTitle(tenantId: string, threadId: string, title: string | null): Promise<void> {
    const schema = await this.#tenantSchema(tenantId);
    await this.#pool.query(
      `update ${schema}.assistant_threads
          set title = $2,
              updated_at = now()
        where thread_id = $1`,
      [threadId, title],
    );
  }

  async updateExplorationName(tenantId: string, explorationId: string, name: string | null): Promise<void> {
    const schema = await this.#tenantSchema(tenantId);
    await this.#pool.query(
      `update ${schema}.exploration_sessions
          set name = $2,
              updated_at = now()
        where exploration_id = $1`,
      [explorationId, name],
    );
  }

  async getOverview(tenantId: string, projectId: string): Promise<OverviewData> {
    const schema = await this.#tenantSchema(tenantId);
    const [
      testCaseCount,
      testCaseStatuses,
      recordingCount,
      recordingAnalysisCount,
      recordingAnalysisStatuses,
      runCount,
      runStatuses,
      threadCount,
      explorationCount,
      explorationStatuses,
      artifactMetrics,
      artifactTypes,
    ] = await Promise.all([
      this.#countRows(schema, 'test_cases', projectId),
      countByValue(this.#pool, schema, 'test_cases', projectId, 'status'),
      this.#countRows(schema, 'recordings', projectId),
      this.#countRows(schema, 'recording_analysis_jobs', projectId),
      countByValue(this.#pool, schema, 'recording_analysis_jobs', projectId, 'status'),
      this.#countRows(schema, 'runs', projectId),
      countByValue(this.#pool, schema, 'runs', projectId, 'status'),
      this.#countRows(schema, 'assistant_threads', projectId),
      this.#countRows(schema, 'exploration_sessions', projectId),
      countByValue(this.#pool, schema, 'exploration_sessions', projectId, 'status'),
      this.#pool.query<{ artifact_count: string; artifact_bytes: string }>(
        `select count(*)::text as artifact_count,
                coalesce(sum(size_bytes), 0)::text as artifact_bytes
           from ${schema}.artifacts
          where project_id = $1`,
        [projectId],
      ),
      countByValue(this.#pool, schema, 'artifacts', projectId, 'artifact_type'),
    ]);

    const activeRunCount = runStatuses
      .filter((item) => !['passed', 'failed', 'canceled'].includes(item.value))
      .reduce((sum, item) => sum + item.count, 0);

    const failedRunCount = runStatuses
      .filter((item) => item.value === 'failed')
      .reduce((sum, item) => sum + item.count, 0);

    return {
      testCaseCount,
      testCaseStatuses,
      recordingCount,
      recordingAnalysisCount,
      recordingAnalysisStatuses,
      runCount,
      activeRunCount,
      failedRunCount,
      threadCount,
      explorationCount,
      explorationStatuses,
      artifactCount: Number(artifactMetrics.rows[0]?.artifact_count ?? '0'),
      artifactBytes: Number(artifactMetrics.rows[0]?.artifact_bytes ?? '0'),
      artifactTypes,
    };
  }

  async getSystemStatus(tenantId: string, projectId: string): Promise<SystemStatus> {
    const schema = await this.#tenantSchema(tenantId);
    const [agentsResult, queueResult] = await Promise.all([
      this.#pool.query<{ count: string }>(
        `select count(*)::text as count
           from ${schema}.agents
          where tenant_id = $1
            and (project_id = $2 or project_id is null)
            and status = 'online'`,
        [tenantId, projectId],
      ),
      this.#pool.query<{ count: string }>(
        `select count(*)::text as count
           from ${schema}.run_items
          where project_id = $1
            and status = 'pending'`,
        [projectId],
      ),
    ]);

    return {
      onlineAgents: Number(agentsResult.rows[0]?.count ?? '0'),
      queuedItems: Number(queueResult.rows[0]?.count ?? '0'),
    };
  }

  async listTestCases(
    tenantId: string,
    projectId: string,
    filter: { query?: string; status?: string; page?: number },
  ): Promise<PageResult<TestCaseListItem>> {
    const schema = await this.#tenantSchema(tenantId);
    const page = normalizePage(filter.page);
    const pageSize = 16;
    const params: unknown[] = [projectId];
    const conditions = ['project_id = $1'];

    if (filter.query?.trim()) {
      params.push(`%${escapeLike(filter.query.trim())}%`);
      const index = params.length;
      conditions.push(`(name ilike $${index} escape '\\' or test_case_id ilike $${index} escape '\\')`);
    }

    if (filter.status?.trim() && filter.status !== 'all') {
      params.push(filter.status.trim());
      conditions.push(`status = $${params.length}`);
    }

    params.push(pageSize + 1, (page - 1) * pageSize);
    const result = await this.#pool.query<{
      test_case_id: string;
      name: string;
      status: string;
      latest_version_id: string | null;
      updated_at: string;
    }>(
      `select test_case_id, name, status, latest_version_id, updated_at::text
         from ${schema}.test_cases
        where ${conditions.join(' and ')}
        order by updated_at desc, test_case_id desc
        limit $${params.length - 1}
       offset $${params.length}`,
      params,
    );

    return this.#pageFromRows(result.rows, page, pageSize, (row) => ({
      id: row.test_case_id,
      name: row.name,
      status: row.status,
      latestVersionId: row.latest_version_id,
      updatedAt: row.updated_at,
    }));
  }

  async getTestCaseDetail(tenantId: string, testCaseId: string): Promise<TestCaseDetail | null> {
    const schema = await this.#tenantSchema(tenantId);
    const testCaseResult = await this.#pool.query<{
      test_case_id: string;
      name: string;
      status: string;
      latest_version_id: string | null;
      latest_published_version_id: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `select test_case_id, name, status, latest_version_id, latest_published_version_id,
              created_at::text, updated_at::text
         from ${schema}.test_cases
        where test_case_id = $1`,
      [testCaseId],
    );
    const testCase = testCaseResult.rows[0];
    if (!testCase) {
      return null;
    }

    const versionsResult = await this.#pool.query<{
      test_case_version_id: string;
      version_no: number;
      version_label: string | null;
      status: string;
      env_profile_json: Record<string, unknown>;
      plan_json: Record<string, unknown>;
      data_template_version_id: string;
      source_recording_id: string | null;
      source_run_id: string | null;
      change_summary: string | null;
      created_at: string;
      dataset_row_id: string | null;
    }>(
      `select version.test_case_version_id,
              version.version_no,
              version.version_label,
              version.status,
              version.env_profile_json,
              version.plan_json,
              version.data_template_version_id,
              version.source_recording_id,
              version.source_run_id,
              version.change_summary,
              version.created_at::text,
              binding.dataset_row_id
         from ${schema}.test_case_versions version
    left join ${schema}.case_default_dataset_bindings binding
           on binding.test_case_version_id = version.test_case_version_id
        where version.test_case_id = $1
        order by version.version_no desc`,
      [testCaseId],
    );

    const latestVersion = versionsResult.rows[0] ?? null;
    const templateResult = latestVersion
      ? await this.#pool.query<{
          data_template_id: string;
          data_template_version_id: string;
          schema_json: Record<string, unknown>;
          validation_rules_json: Record<string, unknown>;
        }>(
          `select data_template_id, data_template_version_id, schema_json, validation_rules_json
             from ${schema}.data_template_versions
            where data_template_version_id = $1`,
          [latestVersion.data_template_version_id],
        )
      : { rows: [] };

    const datasetRowsResult = latestVersion
      ? await this.#pool.query<{
          dataset_row_id: string;
          name: string;
          status: string;
          values_json: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        }>(
          `select dataset_row_id, name, status, values_json, created_at::text, updated_at::text
             from ${schema}.dataset_rows
            where data_template_version_id = $1
            order by updated_at desc, dataset_row_id desc`,
          [latestVersion.data_template_version_id],
        )
      : { rows: [] };

    const latestRunResult = await this.#pool.query<{
      run_id: string;
      name: string | null;
      status: string;
      updated_at: string;
    }>(
      `select distinct on (run.run_id)
              run.run_id,
              run.name,
              run.status,
              run.updated_at::text
         from ${schema}.runs run
         join ${schema}.run_items item on item.run_id = run.run_id
        where item.test_case_id = $1
           or item.test_case_version_id in (
             select test_case_version_id
               from ${schema}.test_case_versions
              where test_case_id = $1
           )
        order by run.run_id, run.updated_at desc`,
      [testCaseId],
    );

    const template = templateResult.rows[0];

    return {
      id: testCase.test_case_id,
      name: testCase.name,
      status: testCase.status,
      latestVersionId: testCase.latest_version_id,
      latestPublishedVersionId: testCase.latest_published_version_id,
      createdAt: testCase.created_at,
      updatedAt: testCase.updated_at,
      versions: versionsResult.rows.map((row) => ({
        id: row.test_case_version_id,
        versionNo: row.version_no,
        versionLabel: row.version_label,
        status: row.status,
        envProfile: readJsonRecord(row.env_profile_json),
        plan: readJsonRecord(row.plan_json),
        dataTemplateVersionId: row.data_template_version_id,
        defaultDatasetRowId: row.dataset_row_id,
        sourceRecordingId: row.source_recording_id,
        sourceRunId: row.source_run_id,
        changeSummary: row.change_summary,
        createdAt: row.created_at,
      })),
      dataTemplate: template
        ? {
            id: template.data_template_id,
            versionId: template.data_template_version_id,
            schema: readJsonRecord(template.schema_json),
            validationRules: readJsonRecord(template.validation_rules_json),
          }
        : null,
      datasetRows: datasetRowsResult.rows.map((row) => ({
        id: row.dataset_row_id,
        name: row.name,
        status: row.status,
        values: readJsonRecord(row.values_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      latestRun: latestRunResult.rows[0]
        ? {
            id: latestRunResult.rows[0].run_id,
            name: latestRunResult.rows[0].name,
            status: latestRunResult.rows[0].status,
            updatedAt: latestRunResult.rows[0].updated_at,
          }
        : null,
    };
  }

  async listRecordings(
    tenantId: string,
    projectId: string,
    filter: { query?: string; status?: string; sourceType?: string; page?: number },
  ): Promise<PageResult<RecordingListItem>> {
    const schema = await this.#tenantSchema(tenantId);
    const page = normalizePage(filter.page);
    const pageSize = 16;
    const params: unknown[] = [projectId];
    const conditions = ['project_id = $1'];

    if (filter.query?.trim()) {
      params.push(`%${escapeLike(filter.query.trim())}%`);
      const index = params.length;
      conditions.push(`(name ilike $${index} escape '\\' or recording_id ilike $${index} escape '\\')`);
    }
    if (filter.status?.trim() && filter.status !== 'all') {
      params.push(filter.status.trim());
      conditions.push(`status = $${params.length}`);
    }
    if (filter.sourceType?.trim() && filter.sourceType !== 'all') {
      params.push(filter.sourceType.trim());
      conditions.push(`source_type = $${params.length}`);
    }

    params.push(pageSize + 1, (page - 1) * pageSize);
    const result = await this.#pool.query<{
      recording_id: string;
      name: string;
      status: string;
      source_type: string;
      updated_at: string;
    }>(
      `select recording_id, name, status, source_type, updated_at::text
         from ${schema}.recordings
        where ${conditions.join(' and ')}
        order by updated_at desc, recording_id desc
        limit $${params.length - 1}
       offset $${params.length}`,
      params,
    );

    return this.#pageFromRows(result.rows, page, pageSize, (row) => ({
      id: row.recording_id,
      name: row.name,
      status: row.status,
      sourceType: row.source_type,
      updatedAt: row.updated_at,
    }));
  }

  async getRecordingDetail(tenantId: string, recordingId: string): Promise<RecordingDetail | null> {
    const schema = await this.#tenantSchema(tenantId);
    const recordingResult = await this.#pool.query<{
      recording_id: string;
      name: string;
      status: string;
      source_type: string;
      env_profile_json: Record<string, unknown>;
      started_at: string;
      finished_at: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `select recording_id, name, status, source_type, env_profile_json,
              started_at::text, finished_at::text, created_at::text, updated_at::text
         from ${schema}.recordings
        where recording_id = $1`,
      [recordingId],
    );
    const recording = recordingResult.rows[0];
    if (!recording) {
      return null;
    }

    const [eventsResult, analysisResult, derivedCasesResult] = await Promise.all([
      this.#pool.query<{
        recording_event_id: string;
        seq_no: number;
        event_type: string;
        page_url: string | null;
        payload_json: Record<string, unknown>;
        captured_at: string;
      }>(
        `select recording_event_id, seq_no, event_type, page_url, payload_json, captured_at::text
           from ${schema}.recording_events
          where recording_id = $1
          order by seq_no asc`,
        [recordingId],
      ),
      this.#pool.query<{
        recording_analysis_job_id: string;
        status: string;
        created_at: string;
        started_at: string;
        finished_at: string | null;
      }>(
        `select recording_analysis_job_id, status, created_at::text, started_at::text, finished_at::text
           from ${schema}.recording_analysis_jobs
          where recording_id = $1
          order by created_at desc`,
        [recordingId],
      ),
      this.#pool.query<{
        test_case_id: string;
        test_case_version_id: string;
        case_name: string;
        version_label: string | null;
        status: string;
        created_at: string;
      }>(
        `select version.test_case_id,
                version.test_case_version_id,
                test_case.name as case_name,
                version.version_label,
                version.status,
                version.created_at::text
           from ${schema}.test_case_versions version
           join ${schema}.test_cases test_case on test_case.test_case_id = version.test_case_id
          where version.source_recording_id = $1
          order by version.created_at desc`,
        [recordingId],
      ),
    ]);

    return {
      id: recording.recording_id,
      name: recording.name,
      status: recording.status,
      sourceType: recording.source_type,
      envProfile: readJsonRecord(recording.env_profile_json),
      startedAt: recording.started_at,
      finishedAt: recording.finished_at,
      createdAt: recording.created_at,
      updatedAt: recording.updated_at,
      events: eventsResult.rows.map((row) => ({
        id: row.recording_event_id,
        seqNo: row.seq_no,
        eventType: row.event_type,
        pageUrl: row.page_url,
        payload: readJsonRecord(row.payload_json),
        capturedAt: row.captured_at,
      })),
      analysisJobs: analysisResult.rows.map((row) => ({
        id: row.recording_analysis_job_id,
        status: row.status,
        createdAt: row.created_at,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
      })),
      derivedCases: derivedCasesResult.rows.map((row) => ({
        testCaseId: row.test_case_id,
        versionId: row.test_case_version_id,
        caseName: row.case_name,
        versionLabel: row.version_label,
        status: row.status,
        createdAt: row.created_at,
      })),
    };
  }

  async listRuns(
    tenantId: string,
    projectId: string,
    filter: { query?: string; status?: string; selectionKind?: string; page?: number },
  ): Promise<PageResult<RunListItem>> {
    const schema = await this.#tenantSchema(tenantId);
    const page = normalizePage(filter.page);
    const pageSize = 16;
    const params: unknown[] = [projectId];
    const conditions = ['project_id = $1'];

    if (filter.query?.trim()) {
      params.push(`%${escapeLike(filter.query.trim())}%`);
      const index = params.length;
      conditions.push(`((name is not null and name ilike $${index} escape '\\') or run_id ilike $${index} escape '\\')`);
    }
    if (filter.status?.trim() && filter.status !== 'all') {
      params.push(filter.status.trim());
      conditions.push(`status = $${params.length}`);
    }
    if (filter.selectionKind?.trim() && filter.selectionKind !== 'all') {
      params.push(filter.selectionKind.trim());
      conditions.push(`selection_kind = $${params.length}`);
    }

    params.push(pageSize + 1, (page - 1) * pageSize);
    const result = await this.#pool.query<{
      run_id: string;
      name: string | null;
      status: string;
      selection_kind: string | null;
      updated_at: string;
    }>(
      `select run_id, name, status, selection_kind, updated_at::text
         from ${schema}.runs
        where ${conditions.join(' and ')}
        order by updated_at desc, run_id desc
        limit $${params.length - 1}
       offset $${params.length}`,
      params,
    );

    return this.#pageFromRows(result.rows, page, pageSize, (row) => ({
      id: row.run_id,
      name: row.name,
      status: row.status,
      selectionKind: row.selection_kind,
      updatedAt: row.updated_at,
    }));
  }

  async getRunDetail(tenantId: string, runId: string, selectedRunItemId?: string): Promise<RunDetail | null> {
    const schema = await this.#tenantSchema(tenantId);
    const runResult = await this.#pool.query<{
      run_id: string;
      name: string | null;
      status: string;
      mode: string | null;
      selection_kind: string | null;
      started_at: string | null;
      finished_at: string | null;
      last_event_id: string;
      updated_at: string;
    }>(
      `select run_id, name, status, mode, selection_kind,
              started_at::text, finished_at::text, last_event_id, updated_at::text
         from ${schema}.runs
        where run_id = $1`,
      [runId],
    );
    const run = runResult.rows[0];
    if (!run) {
      return null;
    }

    const runItemsResult = await this.#pool.query<{
      run_item_id: string;
      status: string;
      attempt_no: number;
      job_kind: string;
      test_case_version_id: string | null;
      dataset_row_id: string | null;
      assigned_agent_id: string | null;
      job_id: string;
    }>(
      `select run_item_id, status, attempt_no, job_kind, test_case_version_id, dataset_row_id, assigned_agent_id, job_id
         from ${schema}.run_items
        where run_id = $1
        order by created_at desc, run_item_id desc`,
      [runId],
    );
    const targetRunItemId = selectedRunItemId && runItemsResult.rows.some((row) => row.run_item_id === selectedRunItemId)
      ? selectedRunItemId
      : runItemsResult.rows[0]?.run_item_id ?? null;

    const [stepEventsResult, artifactsResult, selfHealResult, evaluationResult] = targetRunItemId
      ? await Promise.all([
          this.#pool.query<{
            event_id: string;
            source_step_id: string;
            status: string;
            started_at: string;
            finished_at: string;
            duration_ms: number;
            error_code: string | null;
          }>(
            `select event_id, source_step_id, status, started_at::text, finished_at::text, duration_ms, error_code
               from ${schema}.step_events
              where run_item_id = $1
              order by started_at asc, event_id asc`,
            [targetRunItemId],
          ),
          this.#pool.query<{
            artifact_id: string;
            artifact_type: string;
            content_type: string | null;
            size_bytes: number | null;
            created_at: string;
          }>(
            `select artifact_id, artifact_type, content_type, size_bytes, created_at::text
               from ${schema}.artifacts
              where run_item_id = $1
              order by created_at desc, artifact_id desc`,
            [targetRunItemId],
          ),
          this.#pool.query<{
            self_heal_attempt_id: string;
            status: string;
            explanation: string | null;
            replay_run_id: string | null;
            replay_run_status: string | null;
            derived_test_case_version_id: string | null;
            created_at: string;
          }>(
            `select self_heal_attempt_id, status, explanation, replay_run_id, replay_run_status,
                    derived_test_case_version_id, created_at::text
               from ${schema}.self_heal_attempts
              where run_item_id = $1
              order by created_at desc, self_heal_attempt_id desc`,
            [targetRunItemId],
          ),
          this.#pool.query<{
            run_evaluation_id: string;
            verdict: string;
            explanation: string;
            linked_artifact_ids_json: string[];
            self_heal_attempt_id: string | null;
            created_at: string;
          }>(
            `select run_evaluation_id, verdict, explanation, linked_artifact_ids_json, self_heal_attempt_id, created_at::text
               from ${schema}.run_evaluations
              where run_item_id = $1
              order by created_at desc, run_evaluation_id desc`,
            [targetRunItemId],
          ),
        ])
      : [
          { rows: [] },
          { rows: [] },
          { rows: [] },
          { rows: [] },
        ];

    return {
      id: run.run_id,
      name: run.name,
      status: run.status,
      mode: run.mode,
      selectionKind: run.selection_kind,
      startedAt: run.started_at,
      finishedAt: run.finished_at,
      lastEventId: run.last_event_id,
      updatedAt: run.updated_at,
      runItems: runItemsResult.rows.map((row) => ({
        id: row.run_item_id,
        status: row.status,
        attemptNo: row.attempt_no,
        jobKind: row.job_kind,
        testCaseVersionId: row.test_case_version_id,
        datasetRowId: row.dataset_row_id,
        assignedAgentId: row.assigned_agent_id,
        jobId: row.job_id,
      })),
      selectedRunItemId: targetRunItemId,
      stepEvents: stepEventsResult.rows.map((row) => ({
        id: row.event_id,
        sourceStepId: row.source_step_id,
        status: row.status,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        durationMs: row.duration_ms,
        errorCode: row.error_code,
      })),
      artifacts: artifactsResult.rows.map((row) => ({
        id: row.artifact_id,
        artifactType: row.artifact_type,
        contentType: row.content_type,
        sizeBytes: row.size_bytes,
        createdAt: row.created_at,
      })),
      selfHealAttempts: selfHealResult.rows.map((row) => ({
        id: row.self_heal_attempt_id,
        status: row.status,
        explanation: row.explanation,
        replayRunId: row.replay_run_id,
        replayRunStatus: row.replay_run_status,
        derivedTestCaseVersionId: row.derived_test_case_version_id,
        createdAt: row.created_at,
      })),
      runEvaluations: evaluationResult.rows.map((row) => ({
        id: row.run_evaluation_id,
        verdict: row.verdict,
        explanation: row.explanation,
        linkedArtifactIds: readJsonArray<string>(row.linked_artifact_ids_json),
        selfHealAttemptId: row.self_heal_attempt_id,
        createdAt: row.created_at,
      })),
    };
  }

  async listThreads(
    tenantId: string,
    projectId: string,
    filter: { query?: string; page?: number },
  ): Promise<PageResult<ThreadListItem>> {
    const schema = await this.#tenantSchema(tenantId);
    const page = normalizePage(filter.page);
    const pageSize = 16;
    const params: unknown[] = [projectId];
    const conditions = ['thread.project_id = $1'];
    if (filter.query?.trim()) {
      params.push(`%${escapeLike(filter.query.trim())}%`);
      const index = params.length;
      conditions.push(`((thread.title is not null and thread.title ilike $${index} escape '\\') or thread.thread_id ilike $${index} escape '\\')`);
    }
    params.push(pageSize + 1, (page - 1) * pageSize);
    const result = await this.#pool.query<{
      thread_id: string;
      title: string | null;
      updated_at: string;
      message_count: string;
      fact_count: string;
    }>(
      `select thread.thread_id,
              thread.title,
              thread.updated_at::text,
              count(distinct message.message_id)::text as message_count,
              count(distinct fact.memory_fact_id)::text as fact_count
         from ${schema}.assistant_threads thread
    left join ${schema}.assistant_messages message on message.thread_id = thread.thread_id
    left join ${schema}.assistant_memory_facts fact on fact.thread_id = thread.thread_id
        where ${conditions.join(' and ')}
        group by thread.thread_id, thread.title, thread.updated_at
        order by thread.updated_at desc, thread.thread_id desc
        limit $${params.length - 1}
       offset $${params.length}`,
      params,
    );

    return this.#pageFromRows(result.rows, page, pageSize, (row) => ({
      id: row.thread_id,
      title: row.title,
      messageCount: Number(row.message_count),
      factCount: Number(row.fact_count),
      updatedAt: row.updated_at,
    }));
  }

  async getThreadDetail(tenantId: string, threadId: string): Promise<ThreadDetail | null> {
    const schema = await this.#tenantSchema(tenantId);
    const threadResult = await this.#pool.query<{
      thread_id: string;
      title: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `select thread_id, title, created_at::text, updated_at::text
         from ${schema}.assistant_threads
        where thread_id = $1`,
      [threadId],
    );
    const thread = threadResult.rows[0];
    if (!thread) {
      return null;
    }

    const [messagesResult, factsResult, explorationsResult] = await Promise.all([
      this.#pool.query<{
        message_id: string;
        role: string;
        content: string;
        created_at: string;
      }>(
        `select message_id, role, content, created_at::text
           from ${schema}.assistant_messages
          where thread_id = $1
          order by created_at asc, message_id asc`,
        [threadId],
      ),
      this.#pool.query<{
        memory_fact_id: string;
        content: string;
        confidence: number;
        created_at: string;
      }>(
        `select memory_fact_id, content, confidence, created_at::text
           from ${schema}.assistant_memory_facts
          where thread_id = $1
          order by created_at asc, memory_fact_id asc`,
        [threadId],
      ),
      this.#pool.query<{
        exploration_id: string;
        name: string | null;
        status: string;
        updated_at: string;
      }>(
        `select exploration_id, name, status, updated_at::text
           from ${schema}.exploration_sessions
          where thread_id = $1
          order by updated_at desc, exploration_id desc`,
        [threadId],
      ),
    ]);

    return {
      id: thread.thread_id,
      title: thread.title,
      createdAt: thread.created_at,
      updatedAt: thread.updated_at,
      messages: messagesResult.rows.map((row) => ({
        id: row.message_id,
        role: row.role,
        content: row.content,
        createdAt: row.created_at,
      })),
      facts: factsResult.rows.map((row) => ({
        id: row.memory_fact_id,
        content: row.content,
        confidence: row.confidence,
        createdAt: row.created_at,
      })),
      explorations: explorationsResult.rows.map((row) => ({
        id: row.exploration_id,
        name: row.name,
        status: row.status,
        updatedAt: row.updated_at,
      })),
    };
  }

  async listExplorations(
    tenantId: string,
    projectId: string,
    filter: { query?: string; status?: string; page?: number },
  ): Promise<PageResult<ExplorationListItem>> {
    const schema = await this.#tenantSchema(tenantId);
    const page = normalizePage(filter.page);
    const pageSize = 16;
    const params: unknown[] = [projectId];
    const conditions = ['project_id = $1'];
    if (filter.query?.trim()) {
      params.push(`%${escapeLike(filter.query.trim())}%`);
      const index = params.length;
      conditions.push(`((name is not null and name ilike $${index} escape '\\') or exploration_id ilike $${index} escape '\\')`);
    }
    if (filter.status?.trim() && filter.status !== 'all') {
      params.push(filter.status.trim());
      conditions.push(`status = $${params.length}`);
    }
    params.push(pageSize + 1, (page - 1) * pageSize);
    const result = await this.#pool.query<{
      exploration_id: string;
      name: string | null;
      status: string;
      start_url: string;
      recording_id: string | null;
      updated_at: string;
    }>(
      `select exploration_id, name, status, start_url, recording_id, updated_at::text
         from ${schema}.exploration_sessions
        where ${conditions.join(' and ')}
        order by updated_at desc, exploration_id desc
        limit $${params.length - 1}
       offset $${params.length}`,
      params,
    );

    return this.#pageFromRows(result.rows, page, pageSize, (row) => ({
      id: row.exploration_id,
      name: row.name,
      status: row.status,
      startUrl: row.start_url,
      recordingId: row.recording_id,
      updatedAt: row.updated_at,
    }));
  }

  async getExplorationDetail(tenantId: string, explorationId: string): Promise<ExplorationDetail | null> {
    const schema = await this.#tenantSchema(tenantId);
    const result = await this.#pool.query<{
      exploration_id: string;
      thread_id: string | null;
      name: string | null;
      status: string;
      execution_mode: string;
      instruction: string;
      start_url: string;
      recording_id: string | null;
      summary: string | null;
      last_snapshot_markdown: string | null;
      sample_dataset_json: Record<string, unknown>;
      created_test_case_id: string | null;
      created_test_case_version_id: string | null;
      default_dataset_row_id: string | null;
      artifacts_json: unknown[];
      created_at: string;
      updated_at: string;
    }>(
      `select exploration_id, thread_id, name, status, execution_mode, instruction, start_url,
              recording_id, summary, last_snapshot_markdown, sample_dataset_json,
              created_test_case_id, created_test_case_version_id, default_dataset_row_id,
              artifacts_json, created_at::text, updated_at::text
         from ${schema}.exploration_sessions
        where exploration_id = $1`,
      [explorationId],
    );

    const exploration = result.rows[0];
    if (!exploration) {
      return null;
    }

    return {
      id: exploration.exploration_id,
      threadId: exploration.thread_id,
      name: exploration.name,
      status: exploration.status,
      executionMode: exploration.execution_mode,
      instruction: exploration.instruction,
      startUrl: exploration.start_url,
      recordingId: exploration.recording_id,
      summary: exploration.summary,
      lastSnapshotMarkdown: exploration.last_snapshot_markdown,
      sampleDataset: readJsonRecord(exploration.sample_dataset_json),
      createdTestCaseId: exploration.created_test_case_id,
      createdTestCaseVersionId: exploration.created_test_case_version_id,
      defaultDatasetRowId: exploration.default_dataset_row_id,
      artifacts: readJsonArray<Record<string, unknown>>(exploration.artifacts_json).map((artifact) => ({
        kind: String(artifact.kind ?? 'other'),
        path: String(artifact.path ?? ''),
        sizeBytes: typeof artifact.sizeBytes === 'number'
          ? artifact.sizeBytes
          : typeof artifact.size_bytes === 'number'
            ? artifact.size_bytes
            : null,
      })),
      createdAt: exploration.created_at,
      updatedAt: exploration.updated_at,
    };
  }

  async findRunName(tenantId: string, runId: string): Promise<string | null> {
    const schema = await this.#tenantSchema(tenantId);
    const result = await this.#pool.query<{ name: string | null }>(
      `select name from ${schema}.runs where run_id = $1`,
      [runId],
    );
    return result.rows[0]?.name ?? null;
  }

  #pageFromRows<TInput, TOutput>(
    rows: TInput[],
    page: number,
    pageSize: number,
    mapper: (row: TInput) => TOutput,
  ): PageResult<TOutput> {
    const items = rows.slice(0, pageSize).map(mapper);
    return {
      items,
      hasNext: rows.length > pageSize,
      hasPrevious: page > 1,
      page,
    };
  }

  async #countRows(schema: string, table: string, projectId: string): Promise<number> {
    const result = await this.#pool.query<{ count: string }>(
      `select count(*)::text as count
         from ${schema}.${table}
        where project_id = $1`,
      [projectId],
    );
    return Number(result.rows[0]?.count ?? '0');
  }

  async #tenantSchema(tenantId: string): Promise<string> {
    const result = await this.#pool.query<{ schema_name: string }>(
      'select schema_name from tenant_schemas where tenant_id = $1',
      [tenantId],
    );
    const schemaName = result.rows[0]?.schema_name ?? tenantId;
    return quoteIdentifier(schemaName);
  }
}
