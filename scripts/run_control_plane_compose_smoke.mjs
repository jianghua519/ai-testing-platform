import { Pool } from 'pg';
import {
  DefaultResultEnvelopeFactory,
  createWebWorkerJobFixture,
} from '../apps/web-worker/dist/index.js';
import { DefaultDslCompiler } from '../packages/dsl-compiler/dist/index.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const baseUrl = process.env.CONTROL_PLANE_BASE_URL ?? 'http://control-plane:8080';
const connectionString = process.env.CONTROL_PLANE_DATABASE_URL;

if (!connectionString) {
  throw new Error('CONTROL_PLANE_DATABASE_URL is required');
}

const pool = new Pool({ connectionString });

const postJson = async (url, payload) => {
  const response = await fetch(url, {
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

const getJson = async (url) => {
  const response = await fetch(url);
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

const cloneJob = (job, overrides) => ({
  ...job,
  ...overrides,
});

const buildStepResult = (compiledStep, isoBase) => ({
  compiledStepId: compiledStep.compiledStepId,
  sourceStepId: compiledStep.sourceStepId,
  status: 'passed',
  startedAt: `${isoBase}:00.000Z`,
  finishedAt: `${isoBase}:00.250Z`,
  durationMs: 250,
  attempts: 1,
  artifacts: [],
  extractedVariables: [],
});

const buildJobResult = (metadata, compiledPlanId, stepResult, isoBase) => ({
  metadata,
  status: 'executed',
  issues: [],
  planResult: {
    compiledPlanId,
    status: 'passed',
    startedAt: `${isoBase}:00.000Z`,
    finishedAt: `${isoBase}:00.500Z`,
    durationMs: 500,
    stepResults: [stepResult],
  },
});

try {
  const compiler = new DefaultDslCompiler();
  const envelopeFactory = new DefaultResultEnvelopeFactory();
  const baseFixture = createWebWorkerJobFixture();
  const compileResponse = await compiler.compile({
    sourcePlan: baseFixture.plan,
    envProfile: baseFixture.envProfile,
  });

  assertOk(Boolean(compileResponse.compiledPlan), `compile failed: ${compileResponse.issues.map((issue) => issue.message).join(', ')}`);
  const compiledPlan = compileResponse.compiledPlan;
  const firstStep = compiledPlan.compiledSteps[0];
  const secondStep = compiledPlan.compiledSteps[1];
  assertOk(Boolean(firstStep && secondStep), 'expected two compiled steps');

  const scenarios = [
    cloneJob(baseFixture, {
      jobId: '11111111-1111-1111-1111-111111111111',
      runId: '44444444-4444-4444-4444-444444444441',
      runItemId: '55555555-5555-5555-5555-555555555441',
      traceId: 'trace-compose-1',
      correlationId: 'corr-compose-1',
    }),
    cloneJob(baseFixture, {
      jobId: '11111111-1111-1111-1111-111111111112',
      runId: '44444444-4444-4444-4444-444444444441',
      runItemId: '55555555-5555-5555-5555-555555555442',
      traceId: 'trace-compose-2',
      correlationId: 'corr-compose-2',
    }),
    cloneJob(baseFixture, {
      jobId: '11111111-1111-1111-1111-111111111113',
      runId: '44444444-4444-4444-4444-444444444441',
      runItemId: '55555555-5555-5555-5555-555555555443',
      traceId: 'trace-compose-3',
      correlationId: 'corr-compose-3',
    }),
    cloneJob(baseFixture, {
      jobId: '11111111-1111-1111-1111-111111111114',
      runId: '44444444-4444-4444-4444-444444444442',
      runItemId: '55555555-5555-5555-5555-555555555444',
      traceId: 'trace-compose-4',
      correlationId: 'corr-compose-4',
    }),
    cloneJob(baseFixture, {
      jobId: '11111111-1111-1111-1111-111111111115',
      runId: '44444444-4444-4444-4444-444444444443',
      runItemId: '55555555-5555-5555-5555-555555555445',
      traceId: 'trace-compose-5',
      correlationId: 'corr-compose-5',
    }),
  ];

  const overrideResponse = await postJson(
    `${baseUrl}/api/v1/internal/jobs/${scenarios[0].jobId}/steps/${secondStep.sourceStepId}:override`,
    {
      action: 'replace',
      replacement_step: secondStep,
      reason: 'compose smoke replace',
    },
  );

  const decisionResponse = await postJson(
    `${baseUrl}/api/v1/agent/jobs/${scenarios[0].jobId}/steps/${secondStep.sourceStepId}:decide`,
    {
      job_id: scenarios[0].jobId,
      run_id: scenarios[0].runId,
      run_item_id: scenarios[0].runItemId,
      attempt_no: scenarios[0].attemptNo,
      tenant_id: scenarios[0].tenantId,
      project_id: scenarios[0].projectId,
      trace_id: scenarios[0].traceId,
      correlation_id: scenarios[0].correlationId,
      compiled_step_id: secondStep.compiledStepId,
      source_step_id: secondStep.sourceStepId,
      step_name: secondStep.name,
      page_url: 'https://example.com/home',
      compiled_step: secondStep,
    },
  );

  const firstStepEnvelope = envelopeFactory.buildStepResult(
    {
      jobId: scenarios[0].jobId,
      runId: scenarios[0].runId,
      runItemId: scenarios[0].runItemId,
      attemptNo: scenarios[0].attemptNo,
      tenantId: scenarios[0].tenantId,
      projectId: scenarios[0].projectId,
      traceId: scenarios[0].traceId,
      correlationId: scenarios[0].correlationId,
    },
    buildStepResult(firstStep, '2026-03-07T11:00'),
  );

  const firstPost = await postJson(`${baseUrl}/api/v1/internal/runner-results`, firstStepEnvelope);
  const duplicatePost = await postJson(`${baseUrl}/api/v1/internal/runner-results`, firstStepEnvelope);

  for (const [index, scenario] of scenarios.entries()) {
    await sleep(25);
    const compiledStep = index % 2 === 0 ? firstStep : secondStep;
    const isoBase = `2026-03-07T11:0${index + 1}`;
    const metadata = {
      jobId: scenario.jobId,
      runId: scenario.runId,
      runItemId: scenario.runItemId,
      attemptNo: scenario.attemptNo,
      tenantId: scenario.tenantId,
      projectId: scenario.projectId,
      traceId: scenario.traceId,
      correlationId: scenario.correlationId,
    };

    if (index !== 0) {
      const stepEnvelope = envelopeFactory.buildStepResult(metadata, buildStepResult(compiledStep, isoBase));
      const stepPost = await postJson(`${baseUrl}/api/v1/internal/runner-results`, stepEnvelope);
      assertOk(stepPost.status === 202, `expected step post 202 for scenario ${index}, got ${stepPost.status}`);
    }

    const stepResult = buildStepResult(compiledStep, isoBase);
    const jobEnvelope = envelopeFactory.buildJobResult(buildJobResult(metadata, compiledPlan.compiledPlanId, stepResult, isoBase));
    const jobPost = await postJson(`${baseUrl}/api/v1/internal/runner-results`, jobEnvelope);
    assertOk(jobPost.status === 202, `expected job post 202 for scenario ${index}, got ${jobPost.status}`);
  }

  await pool.query(
    `insert into agents (
       agent_id, tenant_id, project_id, name, platform, architecture, runtime_kind, status, capabilities_json, metadata_json, last_heartbeat_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, '["web","api"]'::jsonb, '{"source":"compose-smoke"}'::jsonb, now())
     on conflict (agent_id) do nothing`,
    [
      '66666666-6666-6666-6666-666666666661',
      baseFixture.tenantId,
      baseFixture.projectId,
      'compose-agent-1',
      'linux',
      'amd64',
      'container',
      'online',
    ],
  );

  await pool.query(
    `insert into job_leases (
       job_id, run_id, run_item_id, agent_id, lease_token, attempt_no, status, metadata_json, expires_at, heartbeat_at
     ) values ($1, $2, $3, $4, $5, $6, $7, '{"source":"compose-smoke"}'::jsonb, now() + interval '5 minutes', now())
     on conflict (lease_token) do nothing`,
    [
      scenarios[0].jobId,
      scenarios[0].runId,
      scenarios[0].runItemId,
      '66666666-6666-6666-6666-666666666661',
      'lease-compose-1',
      scenarios[0].attemptNo,
      'leased',
    ],
  );

  const stepEventIdResult = await pool.query(
    `select event_id
     from step_events
     where run_item_id = $1
     order by received_at desc
     limit 1`,
    [scenarios[0].runItemId],
  );
  const stepEventId = stepEventIdResult.rows[0]?.event_id;
  assertOk(Boolean(stepEventId), 'expected a step event for artifact insertion');

  await pool.query(
    `insert into artifacts (
       artifact_id, tenant_id, project_id, run_id, run_item_id, step_event_id, job_id, artifact_type, storage_uri, content_type, size_bytes, sha256, metadata_json
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, '{"source":"compose-smoke"}'::jsonb)
     on conflict (artifact_id) do nothing`,
    [
      '77777777-7777-7777-7777-777777777771',
      scenarios[0].tenantId,
      scenarios[0].projectId,
      scenarios[0].runId,
      scenarios[0].runItemId,
      stepEventId,
      scenarios[0].jobId,
      'screenshot',
      's3://artifacts/compose-smoke/open-home.png',
      'image/png',
      1024,
      'deadbeef',
    ],
  );

  const [
    health,
    migrationsPage,
    runsPage1,
    runStepEventsPage1,
    runItemPage1,
    runItemStepEventsPage,
    jobEvents,
  ] = await Promise.all([
    getJson(`${baseUrl}/healthz`),
    getJson(`${baseUrl}/api/v1/internal/migrations`),
    getJson(`${baseUrl}/api/v1/runs?tenant_id=${scenarios[0].tenantId}&project_id=${scenarios[0].projectId}&limit=2`),
    getJson(`${baseUrl}/api/v1/internal/runs/${scenarios[0].runId}/step-events?limit=2`),
    getJson(`${baseUrl}/api/v1/run-items?run_id=${scenarios[0].runId}&limit=2`),
    getJson(`${baseUrl}/api/v1/internal/run-items/${scenarios[0].runItemId}/step-events?limit=1`),
    getJson(`${baseUrl}/api/v1/internal/jobs/${scenarios[0].jobId}/events`),
  ]);

  const runsPage2 = await getJson(
    `${baseUrl}/api/v1/runs?tenant_id=${scenarios[0].tenantId}&project_id=${scenarios[0].projectId}&limit=2&cursor=${encodeURIComponent(runsPage1.body.next_cursor)}`,
  );
  const runItemsPage2 = await getJson(
    `${baseUrl}/api/v1/run-items?run_id=${scenarios[0].runId}&limit=2&cursor=${encodeURIComponent(runItemPage1.body.next_cursor)}`,
  );
  const runStepEventsPage2 = await getJson(
    `${baseUrl}/api/v1/internal/runs/${scenarios[0].runId}/step-events?limit=2&cursor=${encodeURIComponent(runStepEventsPage1.body.next_cursor)}`,
  );

  const [databaseSummary, domainCounts, runtimeTableCounts, tableRows] = await Promise.all([
    pool.query(
      `select
         current_database() as current_database,
         current_setting('server_version') as server_version,
         inet_server_addr()::text as server_host,
         inet_server_port()::int as server_port`,
    ),
    pool.query(
      `select
         (select count(*)::int from runs) as runs_count,
         (select count(*)::int from run_items) as run_items_count,
         (select count(*)::int from step_events) as step_events_count`,
    ),
    pool.query(
      `select
         (select count(*)::int from agents) as agents_count,
         (select count(*)::int from job_leases) as job_leases_count,
         (select count(*)::int from artifacts) as artifacts_count`,
    ),
    pool.query(
      `select table_name
       from information_schema.tables
       where table_schema = 'public'
         and table_name in ('agents', 'job_leases', 'artifacts')
       order by table_name asc`,
    ),
  ]);

  assertOk(health.status === 200 && health.body.status === 'ok', 'healthz failed');
  assertOk(overrideResponse.status === 202, `override expected 202, got ${overrideResponse.status}`);
  assertOk(decisionResponse.status === 200 && decisionResponse.body.action === 'replace', 'step decision did not return replace');
  assertOk(firstPost.status === 202, `first step post expected 202, got ${firstPost.status}`);
  assertOk(duplicatePost.status === 200 && duplicatePost.body?.duplicate === true, 'duplicate event was not deduplicated');
  assertOk(migrationsPage.body.items.length === 3, `expected 3 migrations, got ${migrationsPage.body.items.length}`);
  assertOk(runsPage1.body.items.length === 2 && runsPage1.body.next_cursor, 'runs page 1 pagination failed');
  assertOk(runsPage2.body.items.length === 1, 'runs page 2 expected 1 item');
  assertOk(runItemPage1.body.items.length === 2 && runItemPage1.body.next_cursor, 'run items page 1 pagination failed');
  assertOk(runItemsPage2.body.items.length === 1, 'run items page 2 expected 1 item');
  assertOk(runStepEventsPage1.body.items.length === 2 && runStepEventsPage1.body.next_cursor, 'run step events page 1 pagination failed');
  assertOk(runStepEventsPage2.body.items.length === 1, 'run step events page 2 expected 1 item');
  assertOk(runItemStepEventsPage.body.items.length === 1, 'run item step events expected 1 item');
  assertOk(jobEvents.body.items.length === 2, `job events expected 2 items, got ${jobEvents.body.items.length}`);
  assertOk(tableRows.rows.length === 3, `expected 3 runtime extension tables, got ${tableRows.rows.length}`);

  console.log(JSON.stringify({
    health: health.body,
    databaseSummary: databaseSummary.rows[0],
    migrations: migrationsPage.body.items.map((item) => item.version),
    runsPageSizes: [runsPage1.body.items.length, runsPage2.body.items.length],
    runsPageIds: {
      page1: runsPage1.body.items.map((item) => item.id),
      page2: runsPage2.body.items.map((item) => item.id),
    },
    runItemsPageSizes: [runItemPage1.body.items.length, runItemsPage2.body.items.length],
    runItemIds: {
      page1: runItemPage1.body.items.map((item) => item.id),
      page2: runItemsPage2.body.items.map((item) => item.id),
    },
    runStepEventsPageSizes: [runStepEventsPage1.body.items.length, runStepEventsPage2.body.items.length],
    runStepEventIds: {
      page1: runStepEventsPage1.body.items.map((item) => item.source_step_id),
      page2: runStepEventsPage2.body.items.map((item) => item.source_step_id),
    },
    runItemStepEventIds: runItemStepEventsPage.body.items.map((item) => item.source_step_id),
    duplicateBody: duplicatePost.body,
    jobEventTypes: jobEvents.body.items.map((item) => item.envelope.event_type),
    domainCounts: domainCounts.rows[0],
    runtimeTableCounts: runtimeTableCounts.rows[0],
    runtimeTables: tableRows.rows.map((row) => row.table_name),
  }, null, 2));
} finally {
  await pool.end();
}
