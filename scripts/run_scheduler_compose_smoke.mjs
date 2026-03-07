import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
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

const baseUrl = process.env.CONTROL_PLANE_BASE_URL ?? 'http://control-plane:8080';
const connectionString = process.env.CONTROL_PLANE_DATABASE_URL;
if (!connectionString) {
  throw new Error('CONTROL_PLANE_DATABASE_URL is required');
}

const pool = new Pool({ connectionString });

const postJson = async (pathname, payload) => {
  const response = await fetch(new URL(pathname, baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
};

const getJson = async (pathname) => {
  const response = await fetch(new URL(pathname, baseUrl));
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

const createAgent = (client, runner, fixture, descriptorOverrides) => new PollingWebAgent(client, runner, {
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
});

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aiwtp-scheduler-real-'));
const uploadFilePath = path.join(tempDir, 'avatar-smoke.txt');
await writeFile(uploadFilePath, 'avatar smoke payload\n', 'utf8');
const targetServer = await startTargetServer();

try {
  const fixture = createWebWorkerJobFixture();
  const agentClient = new HttpAgentControlPlaneClient({ baseUrl, timeoutMs: 5000 });
  const runner = new WebJobRunner(
    new DefaultDslCompiler(),
    new RegistryBasedPlaywrightAdapter(),
    new HttpResultPublisher({ endpoint: `${baseUrl}/api/v1/internal/runner-results`, timeoutMs: 5000 }),
    new PlaywrightBrowserLauncher(),
  );

  const enqueueResponses = await Promise.all([
    postJson('/api/v1/internal/runs:enqueue-web', {
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
    }),
    postJson('/api/v1/internal/runs:enqueue-web', {
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
    }),
  ]);

  enqueueResponses.forEach((response, index) => {
    assertOk(response.status === 201, `enqueue ${index} expected 201, got ${response.status}`);
  });

  const firefoxAgent = createAgent(agentClient, runner, fixture, {
    agentId: '88888888-8888-8888-8888-888888888880',
    name: 'scheduler-compose-firefox-agent',
    capabilities: ['web', 'browser:firefox'],
  });
  const chromiumAgent = createAgent(agentClient, runner, fixture, {
    agentId: '88888888-8888-8888-8888-888888888881',
    name: 'scheduler-compose-chromium-agent',
    capabilities: ['web', 'browser:chromium'],
  });

  const firefoxCycle = await firefoxAgent.runOnce();
  const cycleResults = await chromiumAgent.runUntilIdle(1);
  const executedCycles = cycleResults.filter((cycle) => cycle.status === 'executed');
  const idleCycles = cycleResults.filter((cycle) => cycle.status === 'idle');

  const [health, runsPage, runItemsPage] = await Promise.all([
    getJson('/healthz'),
    getJson(`/api/v1/runs?tenant_id=${fixture.tenantId}&project_id=${fixture.projectId}&limit=10`),
    getJson(`/api/v1/run-items?run_id=${enqueueResponses[0].body.run.id}&limit=10`),
  ]);
  const stepEventsByRun = await Promise.all(
    enqueueResponses.map((response) => getJson(`/api/v1/internal/runs/${response.body.run.id}/step-events?limit=20`)),
  );
  const jobEventsByJob = await Promise.all(
    enqueueResponses.map((response) => getJson(`/api/v1/internal/jobs/${response.body.job.jobId}/events`)),
  );
  const queuedRunIds = enqueueResponses.map((response) => response.body.run.id);
  const queuedJobIds = enqueueResponses.map((response) => response.body.job.jobId);
  const queuedRunItemIds = enqueueResponses.map((response) => response.body.run_item.id);
  const schedulerAgentIds = [
    '88888888-8888-8888-8888-888888888880',
    '88888888-8888-8888-8888-888888888881',
  ];

  const [agentRows, leaseRows, runRows, runItemRows] = await Promise.all([
    pool.query(`select agent_id, status, capabilities_json, last_heartbeat_at from agents where agent_id = any($1::text[]) order by agent_id asc`, [schedulerAgentIds]),
    pool.query(`select lease_token, status, released_at, heartbeat_at from job_leases where job_id = any($1::text[]) order by lease_id asc`, [queuedJobIds]),
    pool.query(`select run_id, status from runs where run_id = any($1::text[]) order by created_at asc, run_id asc`, [queuedRunIds]),
    pool.query(`select run_item_id, status, required_capabilities_json, assigned_agent_id, lease_token from run_items where run_item_id = any($1::text[]) order by created_at asc, run_item_id asc`, [queuedRunItemIds]),
  ]);

  const interactionHits = targetServer.hits.filter((item) =>
    item.path === '/home' || item.path === '/profile-form' || item.path === '/submit',
  );
  const hitPaths = interactionHits.map((item) => item.path);

  assertOk(health.status === 200 && health.body.status === 'ok', 'healthz failed');
  assertOk(firefoxCycle.status === 'idle', `expected firefox agent to stay idle, got ${firefoxCycle.status}`);
  assertOk(executedCycles.length === 2, `expected 2 executed cycles, got ${executedCycles.length}`);
  assertOk(idleCycles.length === 1, `expected 1 idle cycle, got ${idleCycles.length}`);
  assertOk(hitPaths.filter((value) => value === '/home').length === 2, `expected 2 /home hits, got ${hitPaths}`);
  assertOk(hitPaths.filter((value) => value === '/profile-form').length === 2, `expected 2 /profile-form hits, got ${hitPaths}`);
  assertOk(hitPaths.filter((value) => value === '/submit').length === 2, `expected 2 /submit hits, got ${hitPaths}`);
  assertOk(interactionHits[0]?.userAgent?.includes('HeadlessChrome') || interactionHits[0]?.userAgent?.includes('Chrome'), 'expected chromium user agent evidence');
  assertOk(targetServer.submissions.length === 2, `expected 2 submissions, got ${targetServer.submissions.length}`);
  assertOk(targetServer.submissions.every((payload) => payload.fileName === 'avatar-smoke.txt'), 'expected uploaded file names to match');
  assertOk(targetServer.submissions.some((payload) => payload.displayName === 'Smoke User One'), 'missing submission for Smoke User One');
  assertOk(targetServer.submissions.some((payload) => payload.displayName === 'Smoke User Two'), 'missing submission for Smoke User Two');
  assertOk(runsPage.body.items.length >= 2, 'expected at least 2 runs in list response');
  assertOk(runItemsPage.body.items.length === 1, `expected 1 run item for first run, got ${runItemsPage.body.items.length}`);
  assertOk(stepEventsByRun.every((response) => response.body.items.length === 7), 'expected 7 step events for each run');
  assertOk(jobEventsByJob.every((response) => response.body.items.length === 8), 'expected 8 job events for each queued job');
  assertOk(agentRows.rows.length === 2, `expected 2 scheduler agents, got ${agentRows.rows.length}`);
  assertOk(agentRows.rows.some((row) => row.agent_id === '88888888-8888-8888-8888-888888888880'), 'expected firefox agent row');
  assertOk(agentRows.rows.some((row) => row.agent_id === '88888888-8888-8888-8888-888888888881'), 'expected chromium agent row');
  assertOk(leaseRows.rows.length === 2, `expected 2 lease rows, got ${leaseRows.rows.length}`);
  assertOk(leaseRows.rows.every((row) => row.status === 'completed' && row.released_at), 'expected completed released leases');
  assertOk(runRows.rows.every((row) => row.status === 'passed'), 'expected all runs to be passed');
  assertOk(runItemRows.rows.every((row) => row.status === 'passed' && row.assigned_agent_id === null && row.lease_token === null), 'expected all run items passed and detached from leases');
  assertOk(runItemRows.rows.every((row) => Array.isArray(row.required_capabilities_json) && row.required_capabilities_json.includes('web') && row.required_capabilities_json.includes('browser:chromium')), 'expected required capabilities to include web and browser:chromium');

  console.log(JSON.stringify({
    health: health.body,
    enqueueStatusCodes: enqueueResponses.map((response) => response.status),
    queuedRunIds: enqueueResponses.map((response) => response.body.run.id),
    queuedJobIds: enqueueResponses.map((response) => response.body.job.jobId),
    firefoxCycle,
    cycleResults,
    targetHits: hitPaths,
    firstUserAgent: interactionHits[0]?.userAgent ?? null,
    submissions: targetServer.submissions,
    runsApiStatuses: runsPage.body.items.map((item) => ({ id: item.id, status: item.status })),
    firstRunItemStatuses: runItemsPage.body.items.map((item) => ({ id: item.id, status: item.status, requiredCapabilities: item.summary?.required_capabilities ?? [] })),
    stepEventCountsByRun: stepEventsByRun.map((response) => response.body.items.length),
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
