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

const patchJson = async (pathname, payload = {}, headers = {}) => {
  const response = await fetch(new URL(pathname, baseUrl), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
};

const deleteJson = async (pathname, headers = {}) => {
  const response = await fetch(new URL(pathname, baseUrl), {
    method: 'DELETE',
    headers,
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
    <title>Phase1 Home</title>
  </head>
  <body>
    <main>
      <h1>Phase 1 Test Assets Smoke</h1>
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

const createVersionedPlan = (targetBaseUrl) => ({
  planId: 'phase1-assets-plan',
  planName: 'Phase 1 测试资产模板驱动流程',
  version: 'v1',
  browserProfile: {
    browser: 'chromium',
    headless: true,
    viewport: {
      width: 1440,
      height: 900,
    },
  },
  defaults: {
    artifactPolicy: {
      screenshot: 'always',
      trace: 'always',
      video: 'none',
      domSnapshot: false,
      networkCapture: false,
    },
  },
  steps: [
    {
      stepId: 'open-home',
      name: '打开首页',
      kind: 'navigation',
      action: 'open',
      input: {
        source: 'literal',
        value: `${targetBaseUrl}/home`,
      },
    },
    {
      stepId: 'open-form',
      name: '进入资料表单',
      kind: 'interaction',
      action: 'click',
      locator: {
        strategy: 'test_id',
        value: 'open-profile-form',
      },
    },
    {
      stepId: 'assert-form',
      name: '断言资料表单可见',
      kind: 'assertion',
      action: 'assert',
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
    {
      stepId: 'input-display-name',
      name: '输入显示名称',
      kind: 'interaction',
      action: 'input',
      locator: {
        strategy: 'label',
        value: 'Display Name',
      },
      input: {
        source: 'variable_ref',
        ref: 'displayName',
      },
    },
    {
      stepId: 'upload-avatar',
      name: '上传头像',
      kind: 'interaction',
      action: 'upload',
      locator: {
        strategy: 'label',
        value: 'Avatar',
      },
      input: {
        source: 'file_ref',
        ref: 'avatarFilePath',
      },
    },
    {
      stepId: 'submit-form',
      name: '提交表单',
      kind: 'interaction',
      action: 'click',
      locator: {
        strategy: 'test_id',
        value: 'save-profile',
      },
    },
    {
      stepId: 'assert-result',
      name: '断言结果区域',
      kind: 'assertion',
      action: 'assert',
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
          attrName: 'data-status',
          locator: {
            strategy: 'test_id',
            value: 'result-banner',
          },
        },
      ],
    },
  ],
});

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aiwtp-phase1-assets-'));
const uploadFilePathV1 = path.join(tempDir, 'avatar-v1.txt');
const uploadFilePathV2 = path.join(tempDir, 'avatar-v2.txt');
const uploadFilePathRun = path.join(tempDir, 'avatar-run.txt');
await writeFile(uploadFilePathV1, 'phase1 v1 avatar\n', 'utf8');
await writeFile(uploadFilePathV2, 'phase1 v2 avatar\n', 'utf8');
await writeFile(uploadFilePathRun, 'phase1 run avatar\n', 'utf8');
process.env.WEB_WORKER_ARTIFACT_ROOT = path.join(tempDir, 'artifacts');
await ensureArtifactBucket();
const targetServer = await startTargetServer();

try {
  const fixture = createWebWorkerJobFixture();
  const subjectId = '77777777-2222-3333-4444-555555555555';
  const authHeaders = createAuthHeaders({ subjectId, tenantId: fixture.tenantId });
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

  const createCaseResponse = await postJson('/api/v1/test-cases', {
    tenant_id: fixture.tenantId,
    project_id: fixture.projectId,
    name: 'Phase 1 资产化用例',
    plan: createVersionedPlan(targetServer.baseUrl),
    env_profile: envProfile,
    version_label: 'v1',
    change_summary: 'create draft v1',
    publish: false,
    default_dataset: {
      name: 'v1-default',
      values: {
        displayName: 'Version One User',
        avatarFilePath: uploadFilePathV1,
      },
    },
  }, authHeaders);
  assertOk(createCaseResponse.status === 201, `expected create test case 201, got ${createCaseResponse.status}`);

  const testCase = createCaseResponse.body.test_case;
  const version1 = createCaseResponse.body.version;
  const version1DefaultRow = createCaseResponse.body.default_dataset_row;

  const publishV1Response = await postJson(`/api/v1/test-case-versions/${version1.id}:publish`, {}, authHeaders);
  assertOk(publishV1Response.status === 200, `expected publish v1 200, got ${publishV1Response.status}`);

  const patchCaseResponse = await patchJson(`/api/v1/test-cases/${testCase.id}`, {
    name: 'Phase 1 资产化用例-已更新',
  }, authHeaders);
  assertOk(patchCaseResponse.status === 200, `expected patch test case 200, got ${patchCaseResponse.status}`);

  const createVersion2Response = await postJson(`/api/v1/test-cases/${testCase.id}/versions`, {
    plan: createVersionedPlan(targetServer.baseUrl),
    env_profile: envProfile,
    version_label: 'v2',
    change_summary: 'create draft v2',
    publish: false,
    default_dataset: {
      name: 'v2-default',
      values: {
        displayName: 'Version Two Default User',
        avatarFilePath: uploadFilePathV2,
      },
    },
  }, authHeaders);
  assertOk(createVersion2Response.status === 201, `expected create test case version 201, got ${createVersion2Response.status}`);

  const version2 = createVersion2Response.body.version;
  const version2DefaultRow = createVersion2Response.body.default_dataset_row;

  const publishV2Response = await postJson(`/api/v1/test-case-versions/${version2.id}:publish`, {}, authHeaders);
  assertOk(publishV2Response.status === 200, `expected publish v2 200, got ${publishV2Response.status}`);

  const dataTemplateResponse = await getJson(`/api/v1/test-case-versions/${version2.id}/data-template`, authHeaders);
  assertOk(dataTemplateResponse.status === 200, `expected data template 200, got ${dataTemplateResponse.status}`);
  const templateFieldKeys = dataTemplateResponse.body.schema.fields.map((field) => `${field.key}:${field.source_type}:${field.value_type}`);
  assertOk(
    templateFieldKeys.includes('avatarFilePath:file_ref:file') && templateFieldKeys.includes('displayName:variable_ref:string'),
    `unexpected template fields: ${templateFieldKeys.join(', ')}`,
  );

  const createDatasetRowResponse = await postJson(`/api/v1/test-case-versions/${version2.id}/dataset-rows`, {
    name: 'run-dataset-row',
    values: {
      displayName: 'Bound Dataset User',
      avatarFilePath: uploadFilePathRun,
    },
  }, authHeaders);
  assertOk(createDatasetRowResponse.status === 201, `expected create dataset row 201, got ${createDatasetRowResponse.status}`);

  const updatedDatasetResponse = await patchJson(`/api/v1/dataset-rows/${createDatasetRowResponse.body.id}`, {
    name: 'run-dataset-row-updated',
    values: {
      displayName: 'Final Bound User',
      avatarFilePath: uploadFilePathRun,
    },
  }, authHeaders);
  assertOk(updatedDatasetResponse.status === 200, `expected patch dataset row 200, got ${updatedDatasetResponse.status}`);
  const executionDatasetRow = updatedDatasetResponse.body;

  const bindDefaultResponse = await postJson(`/api/v1/test-case-versions/${version2.id}:bind-default-dataset`, {
    dataset_row_id: executionDatasetRow.id,
  }, authHeaders);
  assertOk(bindDefaultResponse.status === 200, `expected bind default dataset 200, got ${bindDefaultResponse.status}`);
  assertOk(bindDefaultResponse.body.default_dataset_row_id === executionDatasetRow.id, 'bound default dataset row id mismatch');

  const archiveOldDatasetResponse = await deleteJson(`/api/v1/dataset-rows/${version2DefaultRow.id}`, authHeaders);
  assertOk(archiveOldDatasetResponse.status === 200, `expected archive old dataset row 200, got ${archiveOldDatasetResponse.status}`);
  assertOk(archiveOldDatasetResponse.body.status === 'archived', 'expected archived dataset row status');

  const [getCaseResponse, listCasesResponse, getVersion2Response, listVersionsResponse, listDatasetRowsResponse] = await Promise.all([
    getJson(`/api/v1/test-cases/${testCase.id}`, authHeaders),
    getJson(`/api/v1/test-cases?tenant_id=${fixture.tenantId}&project_id=${fixture.projectId}&limit=20`, authHeaders),
    getJson(`/api/v1/test-case-versions/${version2.id}`, authHeaders),
    getJson(`/api/v1/test-cases/${testCase.id}/versions?limit=20`, authHeaders),
    getJson(`/api/v1/test-case-versions/${version2.id}/dataset-rows?limit=20`, authHeaders),
  ]);

  assertOk(getCaseResponse.status === 200, `expected get test case 200, got ${getCaseResponse.status}`);
  assertOk(getVersion2Response.status === 200, `expected get version 200, got ${getVersion2Response.status}`);
  assertOk(listCasesResponse.status === 200, `expected list test cases 200, got ${listCasesResponse.status}`);
  assertOk(listVersionsResponse.status === 200, `expected list versions 200, got ${listVersionsResponse.status}`);
  assertOk(listDatasetRowsResponse.status === 200, `expected list dataset rows 200, got ${listDatasetRowsResponse.status}`);
  assertOk(listCasesResponse.body.items.some((item) => item.id === testCase.id), 'expected created test case in list');
  assertOk(listVersionsResponse.body.items.length >= 2, 'expected at least two test case versions');
  assertOk(listDatasetRowsResponse.body.items.some((item) => item.id === executionDatasetRow.id), 'expected created dataset row in list');

  const agentClient = new HttpAgentControlPlaneClient({ baseUrl, timeoutMs: 5000 });
  const runner = new WebJobRunner(
    new DefaultDslCompiler(),
    new RegistryBasedPlaywrightAdapter(),
    new HttpResultPublisher({ endpoint: `${baseUrl}/api/v1/internal/runner-results`, timeoutMs: 5000 }),
    new PlaywrightBrowserLauncher(),
  );
  const agent = new PollingWebAgent(agentClient, runner, {
    agentId: '99999999-8888-7777-6666-555555555555',
    tenantId: fixture.tenantId,
    projectId: fixture.projectId,
    name: 'phase1-compose-agent',
    platform: 'linux',
    architecture: 'amd64',
    runtimeKind: 'container',
    capabilities: ['web', 'browser:chromium'],
    metadata: { source: 'phase1-compose-smoke' },
  }, {
    supportedJobKinds: ['web'],
    leaseTtlSeconds: 30,
    leaseHeartbeatIntervalMs: 250,
    maxParallelSlots: 1,
  });

  const enqueueRunResponse = await postJson('/api/v1/runs', {
    tenant_id: fixture.tenantId,
    project_id: fixture.projectId,
    name: 'Phase 1 case version execution',
    mode: 'standard',
    selection: {
      kind: 'case_version',
      test_case_version_id: version2.id,
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
  }, { timeoutMs: 120000, label: 'phase1 case version run completion' });
  const agentCycles = await agentPromise;

  assertOk(completedRun.status === 'succeeded', `expected succeeded run, got ${completedRun.status}`);
  assertOk(agentCycles.some((cycle) => cycle.status === 'executed'), 'expected agent to execute at least one cycle');

  const runItemsResponse = await getJson(`/api/v1/run-items?run_id=${runId}&limit=20`, authHeaders);
  assertOk(runItemsResponse.status === 200, `expected list run items 200, got ${runItemsResponse.status}`);
  assertOk(runItemsResponse.body.items.length === 1, `expected 1 run item, got ${runItemsResponse.body.items.length}`);
  const runItem = runItemsResponse.body.items[0];

  const runItemResponse = await getJson(`/api/v1/run-items/${runItem.id}`, authHeaders);
  assertOk(runItemResponse.status === 200, `expected get run item 200, got ${runItemResponse.status}`);
  assertOk(runItemResponse.body.summary.test_case_version_id === version2.id, 'run item test_case_version_id mismatch');
  assertOk(runItemResponse.body.summary.dataset_row_id === executionDatasetRow.id, 'run item dataset_row_id mismatch');
  assertOk(runItemResponse.body.summary.input_snapshot.displayName === 'Final Bound User', 'run item input snapshot displayName mismatch');
  assertOk(runItemResponse.body.summary.input_snapshot.avatarFilePath === uploadFilePathRun, 'run item input snapshot avatarFilePath mismatch');

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

  const [runRowResult, runItemRowResult, artifactRowResult, versionRowResult, testCaseRowResult, datasetRowResult] = await Promise.all([
    pool.query(
      `select run_id, status, selection_kind
       from ${runsTable}
       where run_id = $1`,
      [runId],
    ),
    pool.query(
      `select run_item_id, status, test_case_id, test_case_version_id, data_template_version_id, dataset_row_id, input_snapshot_json
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
      `select count(*)::int as version_count
       from ${versionsTable}
       where test_case_id = $1`,
      [testCase.id],
    ),
    pool.query(
      `select name, status, latest_version_id, latest_published_version_id
       from ${testCasesTable}
       where test_case_id = $1`,
      [testCase.id],
    ),
    pool.query(
      `select dataset_row_id, status
       from ${datasetRowsTable}
       where dataset_row_id = any($1::text[])
       order by dataset_row_id asc`,
      [[version1DefaultRow.id, version2DefaultRow.id, executionDatasetRow.id]],
    ),
  ]);

  assertOk(runRowResult.rows[0]?.selection_kind === 'case_version', 'expected case_version run selection_kind');
  assertOk(runItemRowResult.rows[0]?.test_case_version_id === version2.id, 'run item row test_case_version_id mismatch');
  assertOk(runItemRowResult.rows[0]?.dataset_row_id === executionDatasetRow.id, 'run item row dataset_row_id mismatch');
  assertOk(runItemRowResult.rows[0]?.input_snapshot_json?.displayName === 'Final Bound User', 'stored input snapshot displayName mismatch');
  assertOk(artifactRowResult.rows.length >= 2, 'expected persisted artifact rows');
  assertOk(versionRowResult.rows[0]?.version_count >= 2, 'expected at least two persisted versions');
  assertOk(testCaseRowResult.rows[0]?.name === 'Phase 1 资产化用例-已更新', 'expected patched test case name in database');
  assertOk(testCaseRowResult.rows[0]?.latest_published_version_id === version2.id, 'expected latest published version id to point to v2');
  assertOk(datasetRowResult.rows.some((row) => row.dataset_row_id === version2DefaultRow.id && row.status === 'archived'), 'expected archived v2 default dataset row');
  assertOk(datasetRowResult.rows.some((row) => row.dataset_row_id === executionDatasetRow.id && row.status === 'active'), 'expected active bound dataset row');

  const executionSubmission = targetServer.submissions[targetServer.submissions.length - 1];
  assertOk(Boolean(executionSubmission), 'expected at least one submission to target server');
  assertOk(executionSubmission.displayName === 'Final Bound User', `unexpected submission displayName: ${executionSubmission.displayName}`);
  assertOk(executionSubmission.fileName === path.basename(uploadFilePathRun), `unexpected submission fileName: ${executionSubmission.fileName}`);

  const archiveCaseResponse = await deleteJson(`/api/v1/test-cases/${testCase.id}`, authHeaders);
  assertOk(archiveCaseResponse.status === 200, `expected archive test case 200, got ${archiveCaseResponse.status}`);
  assertOk(archiveCaseResponse.body.status === 'archived', 'expected archived test case status');

  console.log(JSON.stringify({
    status: 'ok',
    runId,
    runItemId: runItem.id,
    testCaseId: testCase.id,
    version1Id: version1.id,
    version2Id: version2.id,
    datasetRowId: executionDatasetRow.id,
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
