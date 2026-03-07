import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import {
  FileBackedControlPlaneStore,
  startControlPlaneServer,
} from '../apps/control-plane/dist/index.js';
import {
  WebJobRunner,
  createWebWorkerJobFixture,
  HttpResultPublisher,
  createStepControllerFactoryFromEnv,
  PlaywrightBrowserLauncher,
} from '../apps/web-worker/dist/index.js';
import { DefaultDslCompiler } from '../packages/dsl-compiler/dist/index.js';
import { RegistryBasedPlaywrightAdapter } from '../packages/playwright-adapter/dist/index.js';

const startTargetServer = async () => {
  const hits = [];
  const submissions = [];

  const renderHomePage = () => `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>Smoke Home</title>
  </head>
  <body>
    <main>
      <h1>真实浏览器交互 Smoke</h1>
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

  const readRequestBody = (req) =>
    new Promise((resolve, reject) => {
      let raw = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        raw += chunk;
      });
      req.on('end', () => resolve(raw));
      req.on('error', reject);
    });

  const server = http.createServer(async (req, res) => {
    hits.push({
      method: req.method ?? 'GET',
      path: req.url ?? '/',
      userAgent: req.headers['user-agent'] ?? '',
    });

    if (req.method === 'GET' && req.url === '/home') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(renderHomePage());
      return;
    }

    if (req.method === 'GET' && req.url === '/profile-form') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(renderProfileFormPage());
      return;
    }

    if (req.method === 'POST' && req.url === '/submit') {
      const rawBody = await readRequestBody(req);
      const payload = JSON.parse(rawBody);
      submissions.push(payload);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        status: 'saved',
        message: `已保存 ${payload.displayName}`,
        displayName: payload.displayName,
        fileName: payload.fileName,
      }));
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
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

const pollUntil = async (fn, timeoutMs = 6000, intervalMs = 25) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await fn();
    if (result) {
      return result;
    }
    if (Date.now() >= deadline) {
      throw new Error('timed out while waiting for smoke run condition');
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
};

const createInteractivePlan = (baseUrl, uploadFilePath) => ({
  planId: 'plan-real-browser-interaction',
  planName: '真实浏览器交互 Smoke 流程',
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
        value: `${baseUrl}/home`,
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
        value: 'Smoke User',
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
          expected: '占位文本',
          locator: {
            strategy: 'test_id',
            value: 'result-message',
          },
        },
      ],
    },
  ],
});

const createReplacementAssertStep = () => ({
  compiledStepId: 'compiled-assert-submit-result-replaced',
  sourceStepId: 'assert-submit-result',
  name: '断言提交结果-远程替换',
  kind: 'assertion',
  action: 'assert',
  executeMode: 'single',
  timeoutMs: 30000,
  retryPolicy: {
    maxAttempts: 1,
    intervalMs: 0,
    backoff: 'fixed',
  },
  artifactPolicy: {
    screenshot: 'none',
    trace: 'none',
    video: 'none',
    domSnapshot: false,
    networkCapture: false,
  },
  runtimeHooks: [],
  expectations: [
    {
      operator: 'visible',
      locator: {
        strategy: 'test_id',
        value: 'result-banner',
        framePath: [],
        stabilityRank: 'preferred',
      },
    },
    {
      operator: 'text_contains',
      expected: '已保存 Smoke User',
      locator: {
        strategy: 'test_id',
        value: 'result-message',
        framePath: [],
        stabilityRank: 'preferred',
      },
    },
    {
      operator: 'text_contains',
      expected: 'avatar-smoke.txt',
      locator: {
        strategy: 'test_id',
        value: 'result-file',
        framePath: [],
        stabilityRank: 'preferred',
      },
    },
    {
      operator: 'attr_equals',
      expected: 'saved',
      attrName: 'data-status',
      locator: {
        strategy: 'test_id',
        value: 'result-banner',
        framePath: [],
        stabilityRank: 'preferred',
      },
    },
    {
      operator: 'value_equals',
      expected: 'Smoke User',
      locator: {
        strategy: 'test_id',
        value: 'saved-display-name',
        framePath: [],
        stabilityRank: 'preferred',
      },
    },
  ],
  children: [],
});

const main = async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aiwtp-real-browser-'));
  const stateFilePath = path.join(tempDir, 'control-plane-state.json');
  const uploadFilePath = path.join(tempDir, 'avatar-smoke.txt');
  await writeFile(uploadFilePath, 'avatar smoke payload\n', 'utf8');

  const targetServer = await startTargetServer();
  const controlPlane = await startControlPlaneServer({
    store: await FileBackedControlPlaneStore.open({ filePath: stateFilePath }),
  });

  try {
    const fixture = createWebWorkerJobFixture();
    fixture.plan = createInteractivePlan(targetServer.baseUrl, uploadFilePath);

    await fetch(`${controlPlane.baseUrl}/api/v1/internal/jobs/${fixture.jobId}/steps/assert-submit-result:override`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'pause', resume_after_ms: 100 }),
    });

    const replacePosted = pollUntil(async () => {
      const eventsResponse = await fetch(`${controlPlane.baseUrl}/api/v1/internal/jobs/${fixture.jobId}/events`);
      const eventsPayload = await eventsResponse.json();
      const hasSubmitStep = eventsPayload.items?.some(
        (item) =>
          item.envelope?.event_type === 'step.result_reported' &&
          item.envelope?.payload?.source_step_id === 'click-submit',
      );

      if (!hasSubmitStep) {
        return false;
      }

      const replaceResponse = await fetch(`${controlPlane.baseUrl}/api/v1/internal/jobs/${fixture.jobId}/steps/assert-submit-result:override`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'replace',
          replacement_step: createReplacementAssertStep(),
        }),
      });

      return replaceResponse.ok;
    });

    const runner = new WebJobRunner(
      new DefaultDslCompiler(),
      new RegistryBasedPlaywrightAdapter(),
      new HttpResultPublisher({ endpoint: `${controlPlane.baseUrl}/api/v1/internal/runner-results`, timeoutMs: 5000 }),
      new PlaywrightBrowserLauncher(),
      createStepControllerFactoryFromEnv({
        ...process.env,
        WEB_WORKER_STEP_CONTROL_MODE: 'http',
        WEB_WORKER_STEP_CONTROL_ENDPOINT: `${controlPlane.baseUrl}/api/v1/agent/jobs/{job_id}/steps/{source_step_id}:decide`,
        WEB_WORKER_STEP_CONTROL_TIMEOUT_MS: '5000',
        WEB_WORKER_STEP_CONTROL_PAUSE_POLL_INTERVAL_MS: '10',
      }),
    );

    const health = await fetch(`${controlPlane.baseUrl}/healthz`).then((response) => response.json());
    const result = await runner.run(fixture);
    const eventsPayload = await fetch(`${controlPlane.baseUrl}/api/v1/internal/jobs/${fixture.jobId}/events`).then((response) => response.json());
    const interactionHits = targetServer.hits.filter((item) =>
      item.path === '/home' || item.path === '/profile-form' || item.path === '/submit',
    );

    console.log(JSON.stringify({
      health,
      resultStatus: result.status,
      replacePosted: await replacePosted,
      eventTypes: eventsPayload.items.map((item) => item.envelope.event_type),
      stepIds: eventsPayload.items
        .filter((item) => item.envelope.event_type === 'step.result_reported')
        .map((item) => item.envelope.payload.source_step_id),
      targetHits: interactionHits.map((item) => item.path),
      firstUserAgent: interactionHits[0]?.userAgent ?? null,
      submissionCount: targetServer.submissions.length,
      submissionPayloads: targetServer.submissions,
      finalAssertPatched: eventsPayload.items
        .filter((item) => item.envelope.event_type === 'step.result_reported')
        .some((item) => item.envelope.payload.source_step_id === 'assert-submit-result' && item.envelope.payload.status === 'passed'),
    }, null, 2));
  } finally {
    await controlPlane.close();
    await targetServer.close();
    await rm(tempDir, { recursive: true, force: true });
  }
};

await main();
