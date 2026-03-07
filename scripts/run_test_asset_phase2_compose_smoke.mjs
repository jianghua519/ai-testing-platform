import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { CreateBucketCommand, HeadBucketCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Pool } from 'pg';
import { DefaultDslCompiler } from '../packages/dsl-compiler/dist/index.js';
import { RegistryBasedPlaywrightAdapter } from '../packages/playwright-adapter/dist/index.js';
import {
  HttpAgentControlPlaneClient,
  HttpResultPublisher,
  PollingWebAgent,
  PlaywrightBrowserLauncher,
  WebJobRunner,
  createWebWorkerJobFixture,
} from '../apps/web-worker/dist/index.js';
import { buildTenantTable, createAuthHeaders, seedProjectMemberships } from './lib/control_plane_auth.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const baseUrl = process.env.CONTROL_PLANE_BASE_URL ?? 'http://control-plane:8080';
const connectionString = process.env.CONTROL_PLANE_DATABASE_URL;
if (!connectionString) {
  throw new Error('CONTROL_PLANE_DATABASE_URL is required');
}

const artifactStorageMode = process.env.ARTIFACT_STORAGE_MODE ?? 'filesystem';
const artifactBucket = process.env.ARTIFACT_S3_BUCKET;
const artifactS3Endpoint = process.env.ARTIFACT_S3_ENDPOINT;
const artifactS3Region = process.env.ARTIFACT_S3_REGION ?? 'us-east-1';
const artifactS3AccessKeyId = process.env.ARTIFACT_S3_ACCESS_KEY_ID;
const artifactS3SecretAccessKey = process.env.ARTIFACT_S3_SECRET_ACCESS_KEY;
const artifactS3ForcePathStyle = process.env.ARTIFACT_S3_FORCE_PATH_STYLE
  ? process.env.ARTIFACT_S3_FORCE_PATH_STYLE === 'true'
  : true;

const artifactS3Client = artifactStorageMode === 's3'
  ? (() => {
    if (!artifactBucket || !artifactS3Endpoint || !artifactS3AccessKeyId || !artifactS3SecretAccessKey) {
      throw new Error('S3 artifact environment variables are required when ARTIFACT_STORAGE_MODE=s3');
    }

    return new S3Client({
      endpoint: artifactS3Endpoint,
      region: artifactS3Region,
      forcePathStyle: artifactS3ForcePathStyle,
      credentials: {
        accessKeyId: artifactS3AccessKeyId,
        secretAccessKey: artifactS3SecretAccessKey,
      },
    });
  })()
  : undefined;

const pool = new Pool({ connectionString });

const postJson = async (pathname, payload = {}, headers = {}) => {
  const response = await fetch(new URL(pathname, baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
};

const getJson = async (pathname, headers = {}) => {
  const response = await fetch(new URL(pathname, baseUrl), { headers });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
};

const assertOk = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const waitFor = async (fn, { timeoutMs = 60000, intervalMs = 250, label = 'condition' } = {}) => {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error(`timed out waiting for ${label}`);
};

const ensureArtifactBucket = async () => {
  if (!artifactS3Client || !artifactBucket) {
    return;
  }

  try {
    await artifactS3Client.send(new HeadBucketCommand({ Bucket: artifactBucket }));
  } catch {
    await artifactS3Client.send(new CreateBucketCommand({ Bucket: artifactBucket }));
  }
};

const parseArtifactLocation = (artifact) => {
  if (artifact?.metadata?.storage_bucket && artifact?.metadata?.storage_object_key) {
    return {
      bucket: artifact.metadata.storage_bucket,
      key: artifact.metadata.storage_object_key,
    };
  }

  const uri = new URL(artifact.storage_uri);
  return {
    bucket: uri.hostname,
    key: decodeURIComponent(uri.pathname.replace(/^\/+/, '')),
  };
};

const readRequestBody = (request) =>
  new Promise((resolve, reject) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('end', () => resolve(raw));
    request.on('error', reject);
  });

const startTargetServer = async () => {
  const submissions = [];
  const hits = [];

  const renderHomePage = () => `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>Phase2 Home</title>
  </head>
  <body>
    <main>
      <h1>Phase 2 Recording Smoke</h1>
      <a href="/profile-form" data-testid="open-profile-form">开始填写资料</a>
    </main>
  </body>
</html>`;

  const renderProfileFormPage = () => `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>Profile Form</title>
  </head>
  <body>
    <main>
      <h1 data-testid="profile-form-title">资料表单</h1>
      <form id="profile-form">
        <label>
          Display Name
          <input id="display-name" aria-label="Display Name" type="text" />
        </label>
        <label>
          Avatar
          <input id="avatar-file" aria-label="Avatar" type="file" />
        </label>
        <button type="submit" data-testid="save-profile">保存资料</button>
      </form>
      <section data-testid="result-banner" data-status="idle" hidden>
        <p data-testid="result-message"></p>
        <p data-testid="result-file"></p>
      </section>
    </main>
    <script>
      document.getElementById('profile-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const displayName = document.getElementById('display-name').value;
        const fileInput = document.getElementById('avatar-file');
        const selectedFile = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
        const response = await fetch('/submit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            displayName,
            fileName: selectedFile ? selectedFile.name : '',
          }),
        });
        const payload = await response.json();
        const resultBanner = document.querySelector('[data-testid="result-banner"]');
        resultBanner.hidden = false;
        resultBanner.dataset.status = payload.status;
        document.querySelector('[data-testid="result-message"]').textContent = payload.message;
        document.querySelector('[data-testid="result-file"]').textContent = payload.fileName;
      });
    </script>
  </body>
</html>`;

  const server = http.createServer(async (request, response) => {
    hits.push({
      method: request.method ?? 'GET',
      path: request.url ?? '/',
    });

    if (request.method === 'GET' && request.url === '/home') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderHomePage());
      return;
    }

    if (request.method === 'GET' && request.url === '/profile-form') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderProfileFormPage());
      return;
    }

    if (request.method === 'POST' && request.url === '/submit') {
      const rawBody = await readRequestBody(request);
      const payload = JSON.parse(rawBody);
      submissions.push(payload);
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({
        status: 'saved',
        message: `已保存 ${payload.displayName}`,
        fileName: payload.fileName,
      }));
      return;
    }

    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('not found');
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    hits,
    submissions,
    async close() {
      server.close();
      await once(server, 'close');
    },
  };
};

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aiwtp-phase2-assets-'));
const publishAvatarPath = path.join(tempDir, 'avatar-recording.txt');
await writeFile(publishAvatarPath, 'phase2 recording avatar\n', 'utf8');
process.env.WEB_WORKER_ARTIFACT_ROOT = path.join(tempDir, 'artifacts');
await ensureArtifactBucket();
const targetServer = await startTargetServer();

try {
  const fixture = createWebWorkerJobFixture();
  const subjectId = '88888888-2222-3333-4444-555555555555';
  const authHeaders = createAuthHeaders({ subjectId, tenantId: fixture.tenantId });
  const recordingsTable = buildTenantTable(fixture.tenantId, 'recordings');
  const recordingEventsTable = buildTenantTable(fixture.tenantId, 'recording_events');
  const recordingAnalysisJobsTable = buildTenantTable(fixture.tenantId, 'recording_analysis_jobs');
  const testCasesTable = buildTenantTable(fixture.tenantId, 'test_cases');
  const versionsTable = buildTenantTable(fixture.tenantId, 'test_case_versions');
  const datasetRowsTable = buildTenantTable(fixture.tenantId, 'dataset_rows');
  const runsTable = buildTenantTable(fixture.tenantId, 'runs');
  const runItemsTable = buildTenantTable(fixture.tenantId, 'run_items');
  const artifactsTable = buildTenantTable(fixture.tenantId, 'artifacts');

  await seedProjectMemberships(pool, {
    tenantId: fixture.tenantId,
    subjectId,
    memberships: [{ projectId: fixture.projectId, roles: ['qa', 'operator'] }],
  });

  const envProfile = {
    ...fixture.envProfile,
    browserProfile: {
      ...fixture.envProfile.browserProfile,
      browser: 'chromium',
      headless: true,
    },
  };

  const createRecordingResponse = await postJson('/api/v1/recordings', {
    tenant_id: fixture.tenantId,
    project_id: fixture.projectId,
    name: 'Phase 2 录制发布流程',
    source_type: 'manual',
    env_profile: envProfile,
  }, authHeaders);
  assertOk(createRecordingResponse.status === 201, `expected create recording 201, got ${createRecordingResponse.status}`);
  const recording = createRecordingResponse.body;

  const getRecordingResponse = await getJson(`/api/v1/recordings/${recording.id}`, authHeaders);
  assertOk(getRecordingResponse.status === 200, `expected get recording 200, got ${getRecordingResponse.status}`);
  assertOk(getRecordingResponse.body.status === 'draft', `unexpected initial recording status: ${getRecordingResponse.body.status}`);

  const appendEventsResponse = await postJson(`/api/v1/recordings/${recording.id}/events`, {
    events: [
      {
        event_type: 'open',
        page_url: `${targetServer.baseUrl}/home`,
        payload: {
          url: `${targetServer.baseUrl}/home`,
        },
      },
      {
        event_type: 'click',
        locator: {
          strategy: 'test_id',
          value: 'open-profile-form',
        },
      },
      {
        event_type: 'assert',
        payload: {
          assertions: [
            {
              operator: 'url_contains',
              expected: '/profile-form',
            },
            {
              operator: 'visible',
              locator: {
                strategy: 'test_id',
                value: 'profile-form-title',
              },
            },
          ],
        },
      },
      {
        event_type: 'input',
        locator: {
          strategy: 'label',
          value: 'Display Name',
        },
        payload: {
          variable_key: 'displayName',
        },
      },
      {
        event_type: 'upload',
        locator: {
          strategy: 'label',
          value: 'Avatar',
        },
        payload: {
          file_key: 'avatarFilePath',
        },
      },
      {
        event_type: 'click',
        locator: {
          strategy: 'test_id',
          value: 'save-profile',
        },
      },
      {
        event_type: 'assert',
        payload: {
          assertions: [
            {
              operator: 'visible',
              locator: {
                strategy: 'test_id',
                value: 'result-banner',
              },
            },
            {
              operator: 'text_contains',
              expected: '已保存',
              locator: {
                strategy: 'test_id',
                value: 'result-message',
              },
            },
            {
              operator: 'attr_equals',
              expected: 'saved',
              attr_name: 'data-status',
              locator: {
                strategy: 'test_id',
                value: 'result-banner',
              },
            },
          ],
        },
      },
    ],
  }, authHeaders);
  assertOk(appendEventsResponse.status === 201, `expected append recording events 201, got ${appendEventsResponse.status}`);
  assertOk(appendEventsResponse.body.appended_count === 7, `expected 7 appended events, got ${appendEventsResponse.body.appended_count}`);

  const analyzeResponse = await postJson(`/api/v1/recordings/${recording.id}:analyze-dsl`, {}, authHeaders);
  assertOk(analyzeResponse.status === 201, `expected analyze recording 201, got ${analyzeResponse.status}`);
  assertOk(analyzeResponse.body.dsl_plan.steps.length === 7, `unexpected analyzed step count: ${analyzeResponse.body.dsl_plan.steps.length}`);
  const templateFieldKeys = analyzeResponse.body.data_template_draft.fields.map((field) => `${field.key}:${field.source_type}:${field.value_type}`);
  assertOk(
    templateFieldKeys.includes('avatarFilePath:file_ref:file') && templateFieldKeys.includes('displayName:variable_ref:string'),
    `unexpected analyzed template fields: ${templateFieldKeys.join(', ')}`,
  );

  const publishResponse = await postJson(`/api/v1/recordings/${recording.id}:publish-test-case`, {
    name: 'Phase 2 录制生成用例',
    version_label: 'recording-v1',
    change_summary: 'publish from recording analysis',
    publish: true,
    analysis_job_id: analyzeResponse.body.id,
    default_dataset: {
      name: 'recording-default',
      values: {
        displayName: 'Recorded Default User',
        avatarFilePath: publishAvatarPath,
      },
    },
  }, authHeaders);
  assertOk(publishResponse.status === 201, `expected publish recording 201, got ${publishResponse.status}`);

  const testCase = publishResponse.body.test_case;
  const version = publishResponse.body.version;
  const defaultDatasetRow = publishResponse.body.default_dataset_row;

  assertOk(version.status === 'published', `expected published version, got ${version.status}`);
  assertOk(version.source_recording_id === recording.id, 'expected version source_recording_id to match recording');
  assertOk(defaultDatasetRow.values.displayName === 'Recorded Default User', 'unexpected publish default dataset displayName');
  assertOk(defaultDatasetRow.values.avatarFilePath === publishAvatarPath, 'unexpected publish default dataset avatar path');

  const publishedRecordingResponse = await getJson(`/api/v1/recordings/${recording.id}`, authHeaders);
  assertOk(publishedRecordingResponse.status === 200, `expected get published recording 200, got ${publishedRecordingResponse.status}`);
  assertOk(publishedRecordingResponse.body.status === 'published', `unexpected published recording status: ${publishedRecordingResponse.body.status}`);

  const versionResponse = await getJson(`/api/v1/test-case-versions/${version.id}`, authHeaders);
  assertOk(versionResponse.status === 200, `expected get published version 200, got ${versionResponse.status}`);
  assertOk(versionResponse.body.source_recording_id === recording.id, 'stored version source_recording_id mismatch');

  const templateResponse = await getJson(`/api/v1/test-case-versions/${version.id}/data-template`, authHeaders);
  assertOk(templateResponse.status === 200, `expected get data template 200, got ${templateResponse.status}`);
  assertOk(templateResponse.body.schema.fields.length === 2, `unexpected data template field count: ${templateResponse.body.schema.fields.length}`);

  const agentClient = new HttpAgentControlPlaneClient({ baseUrl, timeoutMs: 5000 });
  const runner = new WebJobRunner(
    new DefaultDslCompiler(),
    new RegistryBasedPlaywrightAdapter(),
    new HttpResultPublisher({ endpoint: `${baseUrl}/api/v1/internal/runner-results`, timeoutMs: 5000 }),
    new PlaywrightBrowserLauncher(),
  );
  const agent = new PollingWebAgent(agentClient, runner, {
    agentId: '99999999-1111-7777-6666-555555555555',
    tenantId: fixture.tenantId,
    projectId: fixture.projectId,
    name: 'phase2-compose-agent',
    platform: 'linux',
    architecture: 'amd64',
    runtimeKind: 'container',
    capabilities: ['web', 'browser:chromium'],
    metadata: { source: 'phase2-compose-smoke' },
  }, {
    supportedJobKinds: ['web'],
    leaseTtlSeconds: 30,
    leaseHeartbeatIntervalMs: 250,
    maxParallelSlots: 1,
  });

  const enqueueRunResponse = await postJson('/api/v1/runs', {
    tenant_id: fixture.tenantId,
    project_id: fixture.projectId,
    name: 'Phase 2 recording case version execution',
    mode: 'standard',
    selection: {
      kind: 'case_version',
      test_case_version_id: version.id,
    },
  }, authHeaders);
  assertOk(enqueueRunResponse.status === 201, `expected enqueue run 201, got ${enqueueRunResponse.status}`);
  const runId = enqueueRunResponse.body.id;

  const agentPromise = agent.runUntilIdle(1);
  const completedRun = await waitFor(async () => {
    const response = await getJson(`/api/v1/runs/${runId}`, authHeaders);
    if (response.status !== 200) {
      return false;
    }
    return ['succeeded', 'failed', 'canceled'].includes(response.body.status) ? response.body : false;
  }, { timeoutMs: 120000, label: 'phase2 recording run completion' });
  const agentCycles = await agentPromise;

  assertOk(completedRun.status === 'succeeded', `expected succeeded run, got ${completedRun.status}`);
  assertOk(agentCycles.some((cycle) => cycle.status === 'executed'), 'expected agent to execute at least one cycle');

  const runItemsResponse = await getJson(`/api/v1/run-items?run_id=${runId}&limit=20`, authHeaders);
  assertOk(runItemsResponse.status === 200, `expected list run items 200, got ${runItemsResponse.status}`);
  assertOk(runItemsResponse.body.items.length === 1, `expected 1 run item, got ${runItemsResponse.body.items.length}`);
  const runItem = runItemsResponse.body.items[0];

  const runItemResponse = await getJson(`/api/v1/run-items/${runItem.id}`, authHeaders);
  assertOk(runItemResponse.status === 200, `expected get run item 200, got ${runItemResponse.status}`);
  assertOk(runItemResponse.body.summary.test_case_id === testCase.id, 'run item test_case_id mismatch');
  assertOk(runItemResponse.body.summary.test_case_version_id === version.id, 'run item test_case_version_id mismatch');
  assertOk(runItemResponse.body.summary.dataset_row_id === defaultDatasetRow.id, 'run item dataset_row_id mismatch');
  assertOk(runItemResponse.body.summary.source_recording_id === recording.id, 'run item source_recording_id mismatch');
  assertOk(runItemResponse.body.summary.input_snapshot.displayName === 'Recorded Default User', 'run item input snapshot displayName mismatch');
  assertOk(runItemResponse.body.summary.input_snapshot.avatarFilePath === publishAvatarPath, 'run item input snapshot avatarFilePath mismatch');

  const extractResponse = await postJson(`/api/v1/run-items/${runItem.id}:extract-test-case`, {
    version_label: 'recording-v2-from-run',
    change_summary: 'extract from completed run item',
    publish: false,
    default_dataset_name: 'run-derived-default',
  }, authHeaders);
  assertOk(extractResponse.status === 201, `expected extract test case 201, got ${extractResponse.status}`);
  assertOk(extractResponse.body.derivation_mode === 'new_version', `unexpected derivation mode: ${extractResponse.body.derivation_mode}`);
  assertOk(extractResponse.body.test_case.id === testCase.id, 'expected extraction to reuse existing test case');
  assertOk(extractResponse.body.version.source_recording_id === recording.id, 'extracted version source_recording_id mismatch');
  assertOk(extractResponse.body.version.source_run_id === runId, 'extracted version source_run_id mismatch');
  assertOk(extractResponse.body.version.derived_from_case_version_id === version.id, 'extracted version lineage mismatch');
  assertOk(extractResponse.body.default_dataset_row.values.displayName === 'Recorded Default User', 'extracted dataset displayName mismatch');
  assertOk(extractResponse.body.default_dataset_row.values.avatarFilePath === publishAvatarPath, 'extracted dataset avatar path mismatch');

  const versionsResponse = await getJson(`/api/v1/test-cases/${testCase.id}/versions?limit=20`, authHeaders);
  assertOk(versionsResponse.status === 200, `expected list versions 200, got ${versionsResponse.status}`);
  assertOk(versionsResponse.body.items.length >= 2, 'expected extracted second test case version');

  const artifactsResponse = await getJson(`/api/v1/internal/run-items/${runItem.id}/artifacts?limit=50`);
  assertOk(artifactsResponse.status === 200, `expected artifacts 200, got ${artifactsResponse.status}`);
  assertOk(artifactsResponse.body.items.some((item) => item.artifact_type === 'screenshot'), 'expected screenshot artifact');
  assertOk(artifactsResponse.body.items.some((item) => item.artifact_type === 'trace'), 'expected trace artifact');

  const artifactChecks = [];
  for (const artifact of artifactsResponse.body.items.filter((item) => ['screenshot', 'trace'].includes(item.artifact_type)).slice(0, 2)) {
    if (artifactS3Client) {
      const location = parseArtifactLocation(artifact);
      const head = await artifactS3Client.send(new HeadObjectCommand({
        Bucket: location.bucket,
        Key: location.key,
      }));
      artifactChecks.push({
        artifactId: artifact.artifact_id,
        artifactType: artifact.artifact_type,
        storageUri: artifact.storage_uri,
        sizeBytes: Number(head.ContentLength ?? 0),
      });
    } else {
      const fileStats = await stat(new URL(artifact.storage_uri));
      artifactChecks.push({
        artifactId: artifact.artifact_id,
        artifactType: artifact.artifact_type,
        storageUri: artifact.storage_uri,
        sizeBytes: fileStats.size,
      });
    }
  }

  const [
    recordingRowResult,
    recordingEventCountResult,
    recordingAnalysisRowResult,
    runRowResult,
    runItemRowResult,
    artifactRowResult,
    testCaseRowResult,
    versionRowResult,
    datasetRowResult,
  ] = await Promise.all([
    pool.query(
      `select recording_id, status
       from ${recordingsTable}
       where recording_id = $1`,
      [recording.id],
    ),
    pool.query(
      `select count(*)::int as event_count
       from ${recordingEventsTable}
       where recording_id = $1`,
      [recording.id],
    ),
    pool.query(
      `select recording_analysis_job_id, status
       from ${recordingAnalysisJobsTable}
       where recording_id = $1
       order by created_at desc`,
      [recording.id],
    ),
    pool.query(
      `select run_id, status, selection_kind
       from ${runsTable}
       where run_id = $1`,
      [runId],
    ),
    pool.query(
      `select run_item_id, status, test_case_id, test_case_version_id, dataset_row_id, source_recording_id, input_snapshot_json
       from ${runItemsTable}
       where run_item_id = $1`,
      [runItem.id],
    ),
    pool.query(
      `select artifact_id, artifact_type, storage_uri
       from ${artifactsTable}
       where run_item_id = $1
       order by created_at asc`,
      [runItem.id],
    ),
    pool.query(
      `select latest_version_id, latest_published_version_id
       from ${testCasesTable}
       where test_case_id = $1`,
      [testCase.id],
    ),
    pool.query(
      `select test_case_version_id, status, source_recording_id, source_run_id, derived_from_case_version_id
       from ${versionsTable}
       where test_case_id = $1
       order by version_no asc`,
      [testCase.id],
    ),
    pool.query(
      `select dataset_row_id, values_json
       from ${datasetRowsTable}
       where dataset_row_id = any($1::text[])`,
      [[defaultDatasetRow.id, extractResponse.body.default_dataset_row.id]],
    ),
  ]);

  assertOk(recordingRowResult.rows[0]?.status === 'published', 'expected persisted recording status published');
  assertOk(recordingEventCountResult.rows[0]?.event_count === 7, 'expected persisted recording event count 7');
  assertOk(recordingAnalysisRowResult.rows.length === 1, `expected 1 recording analysis job, got ${recordingAnalysisRowResult.rows.length}`);
  assertOk(recordingAnalysisRowResult.rows[0]?.status === 'succeeded', 'expected recording analysis job succeeded');
  assertOk(runRowResult.rows[0]?.selection_kind === 'case_version', 'expected case_version run selection_kind');
  assertOk(runItemRowResult.rows[0]?.source_recording_id === recording.id, 'stored run item source_recording_id mismatch');
  assertOk(runItemRowResult.rows[0]?.dataset_row_id === defaultDatasetRow.id, 'stored run item dataset_row_id mismatch');
  assertOk(runItemRowResult.rows[0]?.input_snapshot_json?.displayName === 'Recorded Default User', 'stored input snapshot displayName mismatch');
  assertOk(artifactRowResult.rows.length >= 2, 'expected persisted artifact rows');
  assertOk(testCaseRowResult.rows[0]?.latest_version_id === extractResponse.body.version.id, 'expected latest version id to point to extracted draft');
  assertOk(testCaseRowResult.rows[0]?.latest_published_version_id === version.id, 'expected latest published version id to stay on published recording version');
  assertOk(versionRowResult.rows.length >= 2, 'expected two persisted case versions');
  assertOk(versionRowResult.rows.some((row) => row.test_case_version_id === extractResponse.body.version.id && row.source_run_id === runId), 'expected extracted version row with source_run_id');
  assertOk(datasetRowResult.rows.length === 2, `expected 2 dataset rows, got ${datasetRowResult.rows.length}`);

  const executionSubmission = targetServer.submissions[targetServer.submissions.length - 1];
  assertOk(Boolean(executionSubmission), 'expected at least one submission to target server');
  assertOk(executionSubmission.displayName === 'Recorded Default User', `unexpected submission displayName: ${executionSubmission.displayName}`);
  assertOk(executionSubmission.fileName === path.basename(publishAvatarPath), `unexpected submission fileName: ${executionSubmission.fileName}`);

  console.log(JSON.stringify({
    status: 'ok',
    recordingId: recording.id,
    analysisJobId: analyzeResponse.body.id,
    testCaseId: testCase.id,
    publishedVersionId: version.id,
    extractedVersionId: extractResponse.body.version.id,
    runId,
    runItemId: runItem.id,
    runStatus: completedRun.status,
    selectionKind: completedRun.summary.selection_kind,
    submission: executionSubmission,
    artifactChecks,
    targetHitCount: targetServer.hits.length,
  }, null, 2));
} finally {
  await targetServer.close();
  await pool.end();
  await rm(tempDir, { recursive: true, force: true });
}
