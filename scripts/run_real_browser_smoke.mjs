import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
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
  const server = http.createServer((req, res) => {
    hits.push({
      method: req.method ?? 'GET',
      path: req.url ?? '/',
      userAgent: req.headers['user-agent'] ?? '',
    });

    if (req.url === '/home') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><head><title>Home</title></head><body><h1>Smoke Home</h1></body></html>');
      return;
    }

    if (req.url === '/dashboard-original') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><head><title>Dashboard Original</title></head><body><h1>Original</h1></body></html>');
      return;
    }

    if (req.url === '/dashboard-patched') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><head><title>Dashboard Patched</title></head><body><h1>Patched</h1></body></html>');
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
    async close() {
      server.close();
      await once(server, 'close');
    },
  };
};

const pollUntil = async (fn, timeoutMs = 4000, intervalMs = 25) => {
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

const main = async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aiwtp-real-browser-'));
  const stateFilePath = path.join(tempDir, 'control-plane-state.json');
  const targetServer = await startTargetServer();
  const controlPlane = await startControlPlaneServer({
    store: await FileBackedControlPlaneStore.open({ filePath: stateFilePath }),
  });

  try {
    const fixture = createWebWorkerJobFixture();
    fixture.plan.steps[0].input.value = `${targetServer.baseUrl}/home`;
    fixture.plan.steps[1].input.value = `${targetServer.baseUrl}/dashboard-original`;

    await fetch(`${controlPlane.baseUrl}/api/v1/internal/jobs/${fixture.jobId}/steps/open-dashboard:override`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'pause', resume_after_ms: 20 }),
    });

    const replacePosted = pollUntil(async () => {
      const eventsResponse = await fetch(`${controlPlane.baseUrl}/api/v1/internal/jobs/${fixture.jobId}/events`);
      const eventsPayload = await eventsResponse.json();
      const hasHomeStep = eventsPayload.items?.some((item) => item.envelope?.event_type === 'step.result_reported' && item.envelope?.payload?.source_step_id === 'open-home');
      if (!hasHomeStep) {
        return false;
      }

      const replaceResponse = await fetch(`${controlPlane.baseUrl}/api/v1/internal/jobs/${fixture.jobId}/steps/open-dashboard:override`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'replace',
          replacement_step: {
            compiledStepId: 'compiled-open-dashboard-smoke-replaced',
            sourceStepId: 'open-dashboard',
            name: '打开控制台-真实浏览器已更新',
            kind: 'navigation',
            action: 'open',
            executeMode: 'single',
            timeoutMs: 30000,
            continueOnFailure: false,
            artifactPolicyResolved: {
              screenshotOnFailure: false,
              screenshotOnSuccess: false,
              snapshotOnFailure: false,
              video: false,
              trace: false,
            },
            inputResolved: {
              source: 'literal',
              value: `${targetServer.baseUrl}/dashboard-patched`,
            },
            targetResolved: undefined,
            expectations: [],
            extractions: [],
            children: [],
            metadata: {},
          },
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
    const pageHits = targetServer.hits.filter((item) => item.path === '/home' || item.path === '/dashboard-original' || item.path === '/dashboard-patched');

    console.log(JSON.stringify({
      health,
      resultStatus: result.status,
      replacePosted: await replacePosted,
      eventTypes: eventsPayload.items.map((item) => item.envelope.event_type),
      stepIds: eventsPayload.items.filter((item) => item.envelope.event_type === 'step.result_reported').map((item) => item.envelope.payload.source_step_id),
      targetHits: pageHits.map((item) => item.path),
      firstUserAgent: pageHits[0]?.userAgent ?? null,
      finalStepUrlPatched: pageHits.some((item) => item.path === '/dashboard-patched'),
    }, null, 2));
  } finally {
    await controlPlane.close();
    await targetServer.close();
    await rm(tempDir, { recursive: true, force: true });
  }
};

await main();
