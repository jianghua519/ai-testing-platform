import { execFile as execFileCallback } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { CreateBucketCommand, HeadBucketCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Pool } from 'pg';
import { DefaultDslCompiler } from '../packages/dsl-compiler/dist/index.js';
import { RegistryBasedPlaywrightAdapter } from '../packages/playwright-adapter/dist/index.js';
import {
  HttpAgentControlPlaneClient,
  HttpStepController,
  HttpResultPublisher,
  PollingWebAgent,
  PlaywrightBrowserLauncher,
  WebJobRunner,
  createWebWorkerJobFixture,
} from '../apps/web-worker/dist/index.js';
import { buildTenantTable, createAuthHeaders, seedProjectMemberships } from './lib/control_plane_auth.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const execFile = promisify(execFileCallback);

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
      throw new Error('ARTIFACT_S3_BUCKET, ARTIFACT_S3_ENDPOINT, ARTIFACT_S3_ACCESS_KEY_ID and ARTIFACT_S3_SECRET_ACCESS_KEY are required when ARTIFACT_STORAGE_MODE=s3');
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

const getResponse = (pathname, options = {}) => fetch(new URL(pathname, baseUrl), options);

const assertOk = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const isObjectMissingError = (error) => {
  const name = error && typeof error === 'object' && typeof error.name === 'string'
    ? error.name
    : '';
  const statusCode = error && typeof error === 'object' && error.$metadata && typeof error.$metadata.httpStatusCode === 'number'
    ? error.$metadata.httpStatusCode
    : undefined;
  return name === 'NoSuchKey' || name === 'NotFound' || statusCode === 404;
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

const parseS3ArtifactLocation = (artifact) => {
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

const waitFor = async (fn, { timeoutMs = 20000, intervalMs = 100, label = 'condition' } = {}) => {
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
  const hits = [];
  const submissions = [];

  const renderHomePage = () => `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>Scheduler Smoke Home</title>
  </head>
  <body>
    <main>
      <h1>调度系统真实浏览器 Smoke</h1>
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
        <input aria-label="Saved Display Name" data-testid="saved-display-name" readonly value="" />
      </section>
    </main>
    <script>
      const form = document.getElementById('profile-form');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const displayName = document.getElementById('display-name').value;
        const fileInput = document.getElementById('avatar-file');
        const selectedFile = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
        const payload = {
          displayName,
          fileName: selectedFile ? selectedFile.name : '',
        };

        const response = await fetch('/submit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await response.json();

        const resultBanner = document.querySelector('[data-testid="result-banner"]');
        resultBanner.hidden = false;
        resultBanner.dataset.status = result.status;
        document.querySelector('[data-testid="result-message"]').textContent = result.message;
        document.querySelector('[data-testid="result-file"]').textContent = result.fileName;
        document.querySelector('[data-testid="saved-display-name"]').value = result.displayName;
      });
    </script>
  </body>
</html>`;

  const server = http.createServer(async (request, response) => {
    hits.push({
      method: request.method ?? 'GET',
      path: request.url ?? '/',
      userAgent: request.headers['user-agent'] ?? '',
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
        displayName: payload.displayName,
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

const createInteractivePlan = (targetBaseUrl, uploadFilePath, displayName) => ({
  planId: `plan-scheduler-${displayName.toLowerCase().replace(/\s+/g, '-')}`,
  planName: `调度系统真实浏览器流程 ${displayName}`,
  version: 'v2',
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
      video: 'always',
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
      stepId: 'click-open-profile-form',
      name: '点击进入资料表单',
      kind: 'interaction',
      action: 'click',
      locator: {
        strategy: 'test_id',
        value: 'open-profile-form',
      },
    },
    {
      stepId: 'assert-profile-form-visible',
      name: '断言资料表单已出现',
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
      stepId: 'wait-control-window',
      name: '等待控制窗口',
      kind: 'control',
      action: 'wait',
      timeoutMs: 3000,
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
        source: 'literal',
        value: displayName,
      },
    },
    {
      stepId: 'upload-avatar',
      name: '上传头像文件',
      kind: 'interaction',
      action: 'upload',
      locator: {
        strategy: 'label',
        value: 'Avatar',
      },
      input: {
        source: 'literal',
        value: uploadFilePath,
      },
    },
    {
      stepId: 'click-submit',
      name: '点击保存资料',
      kind: 'interaction',
      action: 'click',
      locator: {
        strategy: 'test_id',
        value: 'save-profile',
      },
    },
    {
      stepId: 'assert-submit-result',
      name: '断言提交结果',
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
          expected: `已保存 ${displayName}`,
          locator: {
            strategy: 'test_id',
            value: 'result-message',
          },
        },
        {
          operator: 'text_contains',
          expected: path.basename(uploadFilePath),
          locator: {
            strategy: 'test_id',
            value: 'result-file',
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
        {
          operator: 'value_equals',
          expected: displayName,
          locator: {
            strategy: 'test_id',
            value: 'saved-display-name',
          },
        },
      ],
    },
  ],
});

const createAgent = (client, runner, fixture, descriptorOverrides = {}, optionOverrides = {}) => new PollingWebAgent(client, runner, {
  tenantId: fixture.tenantId,
  projectId: fixture.projectId,
  platform: 'linux',
  architecture: 'amd64',
  runtimeKind: 'container',
  metadata: { source: 'compose-scheduler-smoke' },
  ...descriptorOverrides,
}, {
  supportedJobKinds: ['web'],
  leaseTtlSeconds: 30,
  leaseHeartbeatIntervalMs: 250,
  maxParallelSlots: descriptorOverrides.maxParallelSlots ?? 1,
  ...optionOverrides,
});

const collectStepIds = (eventsPayload) =>
  eventsPayload.items
    .filter((item) => item.envelope.event_type === 'step.result_reported')
    .map((item) => `${item.envelope.payload.source_step_id}:${item.envelope.payload.status}`);

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aiwtp-scheduler-real-'));
const uploadFilePath = path.join(tempDir, 'avatar-smoke.txt');
await writeFile(uploadFilePath, 'avatar smoke payload\n', 'utf8');
process.env.WEB_WORKER_ARTIFACT_ROOT = path.join(tempDir, 'artifacts');
await ensureArtifactBucket();
const targetServer = await startTargetServer();

try {
  const fixture = createWebWorkerJobFixture();
  const subjectId = '11111111-2222-3333-4444-555555555555';
  const authHeaders = createAuthHeaders({ subjectId, tenantId: fixture.tenantId });
  const agentsTable = buildTenantTable(fixture.tenantId, 'agents');
  const jobLeasesTable = buildTenantTable(fixture.tenantId, 'job_leases');
  const runsTable = buildTenantTable(fixture.tenantId, 'runs');
  const runItemsTable = buildTenantTable(fixture.tenantId, 'run_items');
  const artifactsTable = buildTenantTable(fixture.tenantId, 'artifacts');
  const agentClient = new HttpAgentControlPlaneClient({ baseUrl, timeoutMs: 5000 });
  const runner = new WebJobRunner(
    new DefaultDslCompiler(),
    new RegistryBasedPlaywrightAdapter(),
    new HttpResultPublisher({ endpoint: `${baseUrl}/api/v1/internal/runner-results`, timeoutMs: 5000 }),
    new PlaywrightBrowserLauncher(),
    {
      create: (metadata) => new HttpStepController(metadata, {
        endpoint: `${baseUrl}/api/v1/agent/jobs/{job_id}/steps/{source_step_id}:decide`,
        timeoutMs: 5000,
      }),
    },
  );

  const enqueuePayloads = [
    {
      tenant_id: fixture.tenantId,
      project_id: fixture.projectId,
      name: '调度浏览器链路用例一',
      mode: 'standard',
      plan: createInteractivePlan(targetServer.baseUrl, uploadFilePath, 'Smoke User One'),
      env_profile: {
        ...fixture.envProfile,
        browserProfile: {
          ...fixture.envProfile.browserProfile,
          browser: 'chromium',
          headless: true,
        },
      },
      variable_context: { case: 'one' },
    },
    {
      tenant_id: fixture.tenantId,
      project_id: fixture.projectId,
      name: '调度浏览器链路用例二',
      mode: 'standard',
      plan: createInteractivePlan(targetServer.baseUrl, uploadFilePath, 'Smoke User Two'),
      env_profile: {
        ...fixture.envProfile,
        browserProfile: {
          ...fixture.envProfile.browserProfile,
          browser: 'chromium',
          headless: true,
        },
      },
      variable_context: { case: 'two' },
    },
    {
      tenant_id: fixture.tenantId,
      project_id: fixture.projectId,
      name: '调度浏览器链路用例三-取消',
      mode: 'standard',
      plan: createInteractivePlan(targetServer.baseUrl, uploadFilePath, 'Smoke User Three'),
      env_profile: {
        ...fixture.envProfile,
        browserProfile: {
          ...fixture.envProfile.browserProfile,
          browser: 'chromium',
          headless: true,
        },
      },
      variable_context: { case: 'three' },
    },
  ];

  await seedProjectMemberships(pool, {
    tenantId: fixture.tenantId,
    subjectId,
    memberships: [{ projectId: fixture.projectId, roles: ['qa', 'operator'] }],
  });

  const enqueueResponses = await Promise.all(enqueuePayloads.map((payload) => postJson('/api/v1/internal/runs:enqueue-web', payload)));
  enqueueResponses.forEach((response, index) => {
    assertOk(response.status === 201, `enqueue ${index} expected 201, got ${response.status}`);
  });

  const firefoxAgent = createAgent(agentClient, runner, fixture, {
    agentId: '88888888-8888-8888-8888-888888888880',
    name: 'scheduler-compose-firefox-agent',
    capabilities: ['web', 'browser:firefox'],
    maxParallelSlots: 1,
  });
  const chromiumAgent = createAgent(agentClient, runner, fixture, {
    agentId: '88888888-8888-8888-8888-888888888881',
    name: 'scheduler-compose-chromium-agent',
    capabilities: ['web', 'browser:chromium'],
    maxParallelSlots: 2,
  }, {
    maxParallelSlots: 2,
  });

  const firefoxCycle = await firefoxAgent.runOnce();
  const chromiumRunPromise = chromiumAgent.runUntilIdle(1);

  const queuedRunIds = enqueueResponses.map((response) => response.body.run.id);
  const queuedJobIds = enqueueResponses.map((response) => response.body.job.jobId);
  const queuedRunItemIds = enqueueResponses.map((response) => response.body.run_item.id);

  const observedActiveLeases = await waitFor(async () => {
    const result = await pool.query(
      `select count(*)::int as active_count
       from ${jobLeasesTable}
       where job_id = any($1::text[])
         and released_at is null`,
      [queuedJobIds],
    );
    return result.rows[0]?.active_count >= 2 ? result.rows[0].active_count : false;
  }, { timeoutMs: 60000, label: 'two active leases' });

  const runOneJobId = enqueueResponses[0].body.job.jobId;
  const runOneRunId = enqueueResponses[0].body.run.id;
  const runOneRunItemId = enqueueResponses[0].body.run_item.id;
  const runThreeJobId = enqueueResponses[2].body.job.jobId;
  const runThreeRunId = enqueueResponses[2].body.run.id;

  await waitFor(async () => {
    const payload = await getJson(`/api/v1/internal/jobs/${runOneJobId}/events`);
    return collectStepIds(payload.body).some((value) => value === 'assert-profile-form-visible:passed') ? payload.body : false;
  }, { timeoutMs: 60000, label: 'run one profile assertion step event' });

  const pauseResponse = await postJson(`/api/v1/internal/runs/${runOneRunId}:pause`);
  const pausedRunItemState = await waitFor(async () => {
    const result = await pool.query(`select control_state from ${runItemsTable} where run_item_id = $1`, [runOneRunItemId]);
    return result.rows[0]?.control_state === 'paused' ? result.rows[0].control_state : false;
  }, { timeoutMs: 60000, label: 'run one paused state' });
  await sleep(500);
  const resumeResponse = await postJson(`/api/v1/internal/runs/${runOneRunId}:resume`);
  const resumedRunItemState = await waitFor(async () => {
    const result = await pool.query(`select control_state from ${runItemsTable} where run_item_id = $1`, [runOneRunItemId]);
    return result.rows[0]?.control_state === 'active' ? result.rows[0].control_state : false;
  }, { timeoutMs: 60000, label: 'run one resumed state' });

  await waitFor(async () => {
    const payload = await getJson(`/api/v1/internal/jobs/${runThreeJobId}/events`);
    return collectStepIds(payload.body).some((value) => value === 'assert-profile-form-visible:passed') ? payload.body : false;
  }, { timeoutMs: 60000, label: 'run three profile assertion step event' });

  const cancelResponse = await postJson(`/api/v1/runs/${runThreeRunId}:cancel`, {}, authHeaders);

  const cycleResults = await chromiumRunPromise;
  const executedCycles = cycleResults.filter((cycle) => cycle.status === 'executed');
  const idleCycles = cycleResults.filter((cycle) => cycle.status === 'idle');

  const [health, runsPage, firstRunItemsPage] = await Promise.all([
    getJson('/healthz'),
    getJson(`/api/v1/runs?tenant_id=${fixture.tenantId}&project_id=${fixture.projectId}&limit=20`, authHeaders),
    getJson(`/api/v1/run-items?run_id=${enqueueResponses[0].body.run.id}&limit=20`, authHeaders),
  ]);
  const stepEventsByRun = await Promise.all(
    enqueueResponses.map((response) => getJson(`/api/v1/internal/runs/${response.body.run.id}/step-events?limit=50`)),
  );
  const artifactsByRunItem = await Promise.all(
    enqueueResponses.map((response) => getJson(`/api/v1/internal/run-items/${response.body.run_item.id}/artifacts?limit=100`)),
  );
  const jobEventsByJob = await Promise.all(
    enqueueResponses.map((response) => getJson(`/api/v1/internal/jobs/${response.body.job.jobId}/events`)),
  );

  const schedulerAgentIds = [
    '88888888-8888-8888-8888-888888888880',
    '88888888-8888-8888-8888-888888888881',
  ];
  const [agentRows, leaseRows, runRows, runItemRows] = await Promise.all([
    pool.query(
      `select agent_id, status, capabilities_json, max_parallel_slots, last_heartbeat_at
       from ${agentsTable}
       where agent_id = any($1::text[])
       order by agent_id asc`,
      [schedulerAgentIds],
    ),
    pool.query(
      `select lease_token, status, released_at, heartbeat_at
       from ${jobLeasesTable}
       where job_id = any($1::text[])
       order by lease_id asc`,
      [queuedJobIds],
    ),
    pool.query(
      `select run_id, status
       from ${runsTable}
       where run_id = any($1::text[])
       order by created_at asc, run_id asc`,
      [queuedRunIds],
    ),
    pool.query(
      `select run_item_id, status, required_capabilities_json, assigned_agent_id, lease_token, control_state
       from ${runItemsTable}
       where run_item_id = any($1::text[])
       order by created_at asc, run_item_id asc`,
      [queuedRunItemIds],
    ),
  ]);

  const interactionHits = targetServer.hits.filter((item) =>
    item.path === '/home' || item.path === '/profile-form' || item.path === '/submit',
  );
  const hitPaths = interactionHits.map((item) => item.path);

  const artifactTypeSets = artifactsByRunItem.map((response) => new Set(response.body.items.map((item) => item.artifact_type)));
  const allArtifacts = artifactsByRunItem.flatMap((response) => response.body.items);
  const artifactSamples = [];
  for (const response of artifactsByRunItem) {
    for (const artifact of response.body.items) {
      if (['screenshot', 'trace', 'video'].includes(artifact.artifact_type)) {
        if (artifactS3Client) {
          const location = parseS3ArtifactLocation(artifact);
          const head = await artifactS3Client.send(new HeadObjectCommand({
            Bucket: location.bucket,
            Key: location.key,
          }));
          artifactSamples.push({
            artifactId: artifact.artifact_id,
            artifactType: artifact.artifact_type,
            storageUri: artifact.storage_uri,
            sizeBytes: Number(head.ContentLength ?? 0),
            retentionExpiresAt: artifact.retention_expires_at ?? null,
            objectKey: location.key,
          });
        } else {
          const fileStats = await stat(new URL(artifact.storage_uri));
          artifactSamples.push({
            artifactId: artifact.artifact_id,
            artifactType: artifact.artifact_type,
            storageUri: artifact.storage_uri,
            sizeBytes: fileStats.size,
            retentionExpiresAt: artifact.retention_expires_at ?? null,
          });
        }
      }
      if (artifactSamples.length >= 3) {
        break;
      }
    }
    if (artifactSamples.length >= 3) {
      break;
    }
  }

  const downloadableArtifact = allArtifacts.find((artifact) => artifact.artifact_type === 'screenshot');
  assertOk(Boolean(downloadableArtifact), 'expected a screenshot artifact for download validation');

  const redirectDownloadResponse = await getResponse(
    `/api/v1/internal/artifacts/${downloadableArtifact.artifact_id}/download?mode=redirect`,
    { redirect: 'manual' },
  );
  const redirectLocation = redirectDownloadResponse.headers.get('location');

  const streamDownloadResponse = await getResponse(
    `/api/v1/internal/artifacts/${downloadableArtifact.artifact_id}/download?mode=stream`,
  );
  const streamDownloadBytes = Buffer.from(await streamDownloadResponse.arrayBuffer());

  await pool.query(
    `update ${artifactsTable}
     set retention_expires_at = now() - interval '1 minute'
     where artifact_id = $1`,
    [downloadableArtifact.artifact_id],
  );

  const { stdout: pruneStdout } = await execFile('node', ['./scripts/prune_expired_artifacts.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CONTROL_PLANE_STORE_MODE: 'postgres',
      CONTROL_PLANE_DATABASE_URL: connectionString,
      CONTROL_PLANE_RUN_MIGRATIONS: 'false',
    },
  });
  const pruneResult = JSON.parse(pruneStdout.trim() || '{}');

  const prunedArtifactRecord = await pool.query(
    `select artifact_id
     from ${artifactsTable}
     where artifact_id = $1`,
    [downloadableArtifact.artifact_id],
  );

  let prunedBlobMissing = false;
  if (artifactS3Client) {
    const location = parseS3ArtifactLocation(downloadableArtifact);
    try {
      await artifactS3Client.send(new HeadObjectCommand({
        Bucket: location.bucket,
        Key: location.key,
      }));
    } catch (error) {
      prunedBlobMissing = isObjectMissingError(error);
    }
  }

  const deletedArtifactDownload = await getResponse(
    `/api/v1/internal/artifacts/${downloadableArtifact.artifact_id}/download?mode=stream`,
  );

  const runStatuses = new Map(runRows.rows.map((row) => [row.run_id, row.status]));
  const runItemStatuses = new Map(runItemRows.rows.map((row) => [row.run_item_id, row.status]));

  assertOk(health.status === 200 && health.body.status === 'ok', 'healthz failed');
  assertOk(firefoxCycle.status === 'idle', `expected firefox agent to stay idle, got ${firefoxCycle.status}`);
  assertOk(observedActiveLeases === 2, `expected to observe 2 active leases, got ${observedActiveLeases}`);
  assertOk(pauseResponse.status === 202, `expected pause response 202, got ${pauseResponse.status}`);
  assertOk(pausedRunItemState === 'paused', `expected paused control state, got ${pausedRunItemState}`);
  assertOk(resumeResponse.status === 202, `expected resume response 202, got ${resumeResponse.status}`);
  assertOk(resumedRunItemState === 'active', `expected resumed control state, got ${resumedRunItemState}`);
  assertOk(cancelResponse.status === 202, `expected cancel response 202, got ${cancelResponse.status}`);
  assertOk(executedCycles.length === 3, `expected 3 executed cycles, got ${executedCycles.length}`);
  assertOk(idleCycles.length === 1, `expected 1 idle cycle, got ${idleCycles.length}`);
  assertOk(hitPaths.filter((value) => value === '/home').length === 3, `expected 3 /home hits, got ${hitPaths}`);
  assertOk(hitPaths.filter((value) => value === '/profile-form').length === 3, `expected 3 /profile-form hits, got ${hitPaths}`);
  assertOk(hitPaths.filter((value) => value === '/submit').length === 2, `expected 2 /submit hits, got ${hitPaths}`);
  assertOk(interactionHits[0]?.userAgent?.includes('HeadlessChrome') || interactionHits[0]?.userAgent?.includes('Chrome'), 'expected chromium user agent evidence');
  assertOk(targetServer.submissions.length === 2, `expected 2 submissions, got ${targetServer.submissions.length}`);
  assertOk(targetServer.submissions.every((payload) => payload.fileName === 'avatar-smoke.txt'), 'expected uploaded file names to match');
  assertOk(runStatuses.get(queuedRunIds[0]) === 'passed', 'expected run one to pass');
  assertOk(runStatuses.get(queuedRunIds[1]) === 'passed', 'expected run two to pass');
  assertOk(runStatuses.get(queuedRunIds[2]) === 'canceled', 'expected run three to cancel');
  assertOk(runItemStatuses.get(queuedRunItemIds[0]) === 'passed', 'expected run item one to pass');
  assertOk(runItemStatuses.get(queuedRunItemIds[1]) === 'passed', 'expected run item two to pass');
  assertOk(runItemStatuses.get(queuedRunItemIds[2]) === 'canceled', 'expected run item three to cancel');
  assertOk(firstRunItemsPage.body.items.length === 1, `expected 1 run item for first run, got ${firstRunItemsPage.body.items.length}`);
  assertOk(stepEventsByRun[0].body.items.length === 8, `expected run one to emit 8 step events, got ${stepEventsByRun[0].body.items.length}`);
  assertOk(stepEventsByRun[1].body.items.length === 8, `expected run two to emit 8 step events, got ${stepEventsByRun[1].body.items.length}`);
  assertOk(stepEventsByRun[2].body.items.some((item) => item.status === 'canceled'), 'expected run three to contain a canceled step');
  assertOk(jobEventsByJob.every((response) => response.body.items.length === 9), 'expected each job to emit 8 step events plus 1 job event');
  assertOk(agentRows.rows.length === 2, `expected 2 scheduler agents, got ${agentRows.rows.length}`);
  assertOk(agentRows.rows.find((row) => row.agent_id === '88888888-8888-8888-8888-888888888881')?.max_parallel_slots === 2, 'expected chromium agent max_parallel_slots=2');
  assertOk(leaseRows.rows.length === 3, `expected 3 lease rows, got ${leaseRows.rows.length}`);
  assertOk(leaseRows.rows.filter((row) => row.status === 'completed').length === 2, 'expected 2 completed leases');
  assertOk(leaseRows.rows.filter((row) => row.status === 'canceled').length === 1, 'expected 1 canceled lease');
  assertOk(leaseRows.rows.every((row) => row.released_at), 'expected every lease to be released');
  assertOk(runItemRows.rows.every((row) => Array.isArray(row.required_capabilities_json) && row.required_capabilities_json.includes('web') && row.required_capabilities_json.includes('browser:chromium')), 'expected required capabilities to include web and browser:chromium');
  assertOk(runItemRows.rows.every((row) => row.assigned_agent_id === null && row.lease_token === null && row.control_state === 'active'), 'expected all run items detached from agent, lease and control state');
  assertOk(artifactTypeSets.every((types) => types.has('screenshot') && types.has('trace') && types.has('video')), 'expected each run item to have screenshot/trace/video artifacts');
  assertOk(artifactSamples.length === 3, `expected artifact samples for screenshot/trace/video, got ${artifactSamples.length}`);
  assertOk(allArtifacts.every((artifact) => artifact.storage_uri.startsWith('s3://')), 'expected artifact storage URIs to use s3://');
  assertOk(allArtifacts.every((artifact) => typeof artifact.retention_expires_at === 'string' && artifact.retention_expires_at.length > 0), 'expected retention_expires_at for every artifact');
  assertOk(redirectDownloadResponse.status === 302, `expected redirect download status 302, got ${redirectDownloadResponse.status}`);
  assertOk(Boolean(redirectLocation) && redirectLocation.includes('X-Amz-Algorithm='), 'expected signed redirect download URL');
  assertOk(streamDownloadResponse.status === 200, `expected stream download status 200, got ${streamDownloadResponse.status}`);
  assertOk(streamDownloadBytes.byteLength > 0, 'expected streamed artifact bytes');
  assertOk(streamDownloadResponse.headers.get('content-type') === 'image/png', `expected image/png download content-type, got ${streamDownloadResponse.headers.get('content-type')}`);
  assertOk(pruneResult.deletedCount === 1, `expected prune to delete 1 artifact, got ${pruneResult.deletedCount}`);
  assertOk(Array.isArray(pruneResult.deletedArtifactIds) && pruneResult.deletedArtifactIds.includes(downloadableArtifact.artifact_id), 'expected prune result to include deleted artifact id');
  assertOk(pruneResult.failures?.length === 0, `expected prune failures to be empty, got ${JSON.stringify(pruneResult.failures)}`);
  assertOk(prunedArtifactRecord.rows.length === 0, 'expected pruned artifact record to be removed');
  assertOk(prunedBlobMissing, 'expected pruned artifact blob to be deleted from object storage');
  assertOk(deletedArtifactDownload.status === 404, `expected deleted artifact download to return 404, got ${deletedArtifactDownload.status}`);
  assertOk(runsPage.body.items.length >= 3, 'expected at least 3 runs in list response');

  console.log(JSON.stringify({
    health: health.body,
    enqueueStatusCodes: enqueueResponses.map((response) => response.status),
    queuedRunIds,
    queuedJobIds,
    firefoxCycle,
    cycleResults,
    observedActiveLeases,
    pauseResponseStatus: pauseResponse.status,
    pausedRunItemState,
    resumeResponseStatus: resumeResponse.status,
    resumedRunItemState,
    cancelResponseStatus: cancelResponse.status,
    targetHits: hitPaths,
    firstUserAgent: interactionHits[0]?.userAgent ?? null,
    submissions: targetServer.submissions,
    runsApiStatuses: runsPage.body.items.map((item) => ({ id: item.id, status: item.status })),
    firstRunItemStatuses: firstRunItemsPage.body.items.map((item) => ({
      id: item.id,
      status: item.status,
      requiredCapabilities: item.summary?.required_capabilities ?? [],
      controlState: item.summary?.control_state ?? null,
    })),
    stepEventStatusesByRun: stepEventsByRun.map((response) => response.body.items.map((item) => `${item.source_step_id}:${item.status}`)),
    artifactTypesByRunItem: artifactsByRunItem.map((response) => response.body.items.map((item) => item.artifact_type)),
    artifactSamples,
    artifactRetentionByRunItem: artifactsByRunItem.map((response) => response.body.items.map((item) => item.retention_expires_at)),
    artifactDownload: {
      redirectStatus: redirectDownloadResponse.status,
      redirectLocation,
      streamStatus: streamDownloadResponse.status,
      streamContentType: streamDownloadResponse.headers.get('content-type'),
      streamSizeBytes: streamDownloadBytes.byteLength,
      deletedStreamStatus: deletedArtifactDownload.status,
    },
    artifactPrune: pruneResult,
    jobEventTypesByJob: jobEventsByJob.map((response) => response.body.items.map((item) => item.envelope.event_type)),
    agentRows: agentRows.rows,
    leaseRows: leaseRows.rows,
    runRows: runRows.rows,
    runItemRows: runItemRows.rows,
  }, null, 2));
} finally {
  await pool.end();
  await targetServer.close();
  await rm(tempDir, { recursive: true, force: true });
}
