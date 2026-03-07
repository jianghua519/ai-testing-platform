import { Pool } from 'pg';
import { DefaultDslCompiler } from '../packages/dsl-compiler/dist/index.js';
import { RegistryBasedPlaywrightAdapter } from '../packages/playwright-adapter/dist/index.js';
import {
  HttpAgentControlPlaneClient,
  HttpResultPublisher,
  PollingWebAgent,
  WebJobRunner,
  createWebWorkerJobFixture,
  FakeBrowserLauncher,
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

try {
  const fixture = createWebWorkerJobFixture();
  const agentClient = new HttpAgentControlPlaneClient({ baseUrl, timeoutMs: 5000 });
  const browserLauncher = new FakeBrowserLauncher({ delayMs: 120 });
  const runner = new WebJobRunner(
    new DefaultDslCompiler(),
    new RegistryBasedPlaywrightAdapter(),
    new HttpResultPublisher({ endpoint: `${baseUrl}/api/v1/internal/runner-results`, timeoutMs: 5000 }),
    browserLauncher,
  );
  const agent = new PollingWebAgent(agentClient, runner, {
    agentId: '88888888-8888-8888-8888-888888888881',
    tenantId: fixture.tenantId,
    projectId: fixture.projectId,
    name: 'scheduler-compose-agent',
    platform: 'linux',
    architecture: 'amd64',
    runtimeKind: 'container',
    capabilities: ['web'],
    metadata: { source: 'compose-scheduler-smoke' },
  }, {
    supportedJobKinds: ['web'],
    leaseTtlSeconds: 30,
    leaseHeartbeatIntervalMs: 50,
  });

  const enqueueResponses = await Promise.all([
    postJson('/api/v1/internal/runs:enqueue-web', {
      tenant_id: fixture.tenantId,
      project_id: fixture.projectId,
      name: '调度链路用例一',
      mode: 'standard',
      plan: fixture.plan,
      env_profile: fixture.envProfile,
      variable_context: { case: 'one' },
    }),
    postJson('/api/v1/internal/runs:enqueue-web', {
      tenant_id: fixture.tenantId,
      project_id: fixture.projectId,
      name: '调度链路用例二',
      mode: 'standard',
      plan: fixture.plan,
      env_profile: fixture.envProfile,
      variable_context: { case: 'two' },
    }),
  ]);

  enqueueResponses.forEach((response, index) => {
    assertOk(response.status === 201, `enqueue ${index} expected 201, got ${response.status}`);
  });

  const cycleResults = await agent.runUntilIdle(1);
  const executedCycles = cycleResults.filter((cycle) => cycle.status === 'executed');
  const idleCycles = cycleResults.filter((cycle) => cycle.status === 'idle');

  const [health, runsPage, runItemsPage] = await Promise.all([
    getJson('/healthz'),
    getJson(`/api/v1/runs?tenant_id=${fixture.tenantId}&project_id=${fixture.projectId}&limit=10`),
    getJson(`/api/v1/run-items?run_id=${enqueueResponses[0].body.run.id}&limit=10`),
  ]);
  const stepEventsByRun = await Promise.all(
    enqueueResponses.map((response) => getJson(`/api/v1/internal/runs/${response.body.run.id}/step-events?limit=10`)),
  );
  const jobEventsByJob = await Promise.all(
    enqueueResponses.map((response) => getJson(`/api/v1/internal/jobs/${response.body.job.jobId}/events`)),
  );

  const [agentRows, leaseRows, runRows, runItemRows] = await Promise.all([
    pool.query(`select agent_id, status, last_heartbeat_at from agents order by agent_id asc`),
    pool.query(`select lease_token, status, released_at, heartbeat_at from job_leases order by lease_id asc`),
    pool.query(`select run_id, status from runs order by created_at asc, run_id asc`),
    pool.query(`select run_item_id, status, assigned_agent_id, lease_token from run_items order by created_at asc, run_item_id asc`),
  ]);

  assertOk(health.status === 200 && health.body.status === 'ok', 'healthz failed');
  assertOk(executedCycles.length === 2, `expected 2 executed cycles, got ${executedCycles.length}`);
  assertOk(idleCycles.length === 1, `expected 1 idle cycle, got ${idleCycles.length}`);
  assertOk(browserLauncher.visitedUrls.length === 4, `expected 4 visited urls, got ${browserLauncher.visitedUrls.length}`);
  assertOk(runsPage.body.items.length >= 2, 'expected at least 2 runs in list response');
  assertOk(runItemsPage.body.items.length === 1, `expected 1 run item for first run, got ${runItemsPage.body.items.length}`);
  assertOk(stepEventsByRun.every((response) => response.body.items.length === 2), 'expected 2 step events for each run');
  assertOk(jobEventsByJob.every((response) => response.body.items.length === 3), 'expected 3 job events for each queued job');
  assertOk(agentRows.rows.length === 1 && agentRows.rows[0].status === 'online', 'expected 1 online agent');
  assertOk(leaseRows.rows.length === 2, `expected 2 lease rows, got ${leaseRows.rows.length}`);
  assertOk(leaseRows.rows.every((row) => row.status === 'completed' && row.released_at), 'expected completed released leases');
  assertOk(runRows.rows.every((row) => row.status === 'passed'), 'expected all runs to be passed');
  assertOk(runItemRows.rows.every((row) => row.status === 'passed' && row.assigned_agent_id === null && row.lease_token === null), 'expected all run items passed and detached from leases');

  console.log(JSON.stringify({
    health: health.body,
    enqueueStatusCodes: enqueueResponses.map((response) => response.status),
    queuedRunIds: enqueueResponses.map((response) => response.body.run.id),
    queuedJobIds: enqueueResponses.map((response) => response.body.job.jobId),
    cycleResults,
    visitedUrls: browserLauncher.visitedUrls,
    runsApiStatuses: runsPage.body.items.map((item) => ({ id: item.id, status: item.status })),
    firstRunItemStatuses: runItemsPage.body.items.map((item) => ({ id: item.id, status: item.status })),
    stepEventCountsByRun: stepEventsByRun.map((response) => response.body.items.length),
    jobEventTypesByJob: jobEventsByJob.map((response) => response.body.items.map((item) => item.envelope.event_type)),
    agentRows: agentRows.rows,
    leaseRows: leaseRows.rows,
    runRows: runRows.rows,
    runItemRows: runItemRows.rows,
  }, null, 2));
} finally {
  await pool.end();
}
