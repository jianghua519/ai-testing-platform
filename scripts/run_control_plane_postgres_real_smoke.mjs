import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';
import EmbeddedPostgres from 'embedded-postgres';
import {
  PostgresControlPlaneStore,
  runControlPlanePostgresMigrations,
  startControlPlaneServer,
} from '../apps/control-plane/dist/index.js';
import {
  DefaultResultEnvelopeFactory,
  createWebWorkerJobFixture,
} from '../apps/web-worker/dist/index.js';
import { DefaultDslCompiler } from '../packages/dsl-compiler/dist/index.js';

const getAvailablePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.unref();
  probe.on('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    if (!address || typeof address === 'string') {
      probe.close(() => reject(new Error('failed to resolve an available TCP port')));
      return;
    }

    const { port } = address;
    probe.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(port);
    });
  });
});

const buildConnectionString = ({ user, password, port, database }) =>
  `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}/${database}`;

const readDomainSummary = async (pool, fixture) => {
  const [runs, runItems, stepEvents, stepDecisions, rawEvents] = await Promise.all([
    pool.query('select run_id, status, last_event_id from runs where run_id = $1', [fixture.runId]),
    pool.query('select run_item_id, status, last_event_id from run_items where run_item_id = $1', [fixture.runItemId]),
    pool.query('select source_step_id, status from step_events where run_item_id = $1 order by received_at asc', [fixture.runItemId]),
    pool.query(
      `select
         count(*)::int as total_count,
         sum(case when consumed_at is not null then 1 else 0 end)::int as consumed_count,
         min(run_id) as run_id,
         min(run_item_id) as run_item_id
       from step_decisions
       where job_id = $1`,
      [fixture.jobId],
    ),
    pool.query('select count(*)::int as total_count from control_plane_runner_events where job_id = $1', [fixture.jobId]),
  ]);

  return {
    runStatus: runs.rows[0]?.status ?? null,
    runLastEventId: runs.rows[0]?.last_event_id ?? null,
    runItemStatus: runItems.rows[0]?.status ?? null,
    runItemLastEventId: runItems.rows[0]?.last_event_id ?? null,
    stepEventCount: stepEvents.rows.length,
    stepEventStepIds: stepEvents.rows.map((row) => row.source_step_id),
    stepDecisionTotal: stepDecisions.rows[0]?.total_count ?? 0,
    stepDecisionConsumed: stepDecisions.rows[0]?.consumed_count ?? 0,
    stepDecisionRunId: stepDecisions.rows[0]?.run_id ?? null,
    stepDecisionRunItemId: stepDecisions.rows[0]?.run_item_id ?? null,
    rawEventCount: rawEvents.rows[0]?.total_count ?? 0,
  };
};

const readDatabaseSummary = async (pool) => {
  const result = await pool.query(
    `select
       current_database() as current_database,
       current_setting('server_version') as server_version,
       current_setting('data_directory') as data_directory,
       inet_server_port()::int as server_port,
       version() as version_string`,
  );
  return result.rows[0] ?? null;
};

const main = async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aiwtp-postgres-real-smoke-'));
  const port = await getAvailablePort();
  const postgres = new EmbeddedPostgres({
    databaseDir: path.join(tempRoot, 'db'),
    user: 'postgres',
    password: 'aiwtp-password',
    port,
    persistent: true,
    onLog: () => {},
    onError: (message) => console.error('[embedded-postgres]', message),
  });

  const databaseName = 'aiwtp_smoke';
  const connectionString = buildConnectionString({
    user: 'postgres',
    password: 'aiwtp-password',
    port,
    database: databaseName,
  });

  let firstServer;
  let secondServer;
  let firstStore;
  let secondStore;
  let firstPool;
  let secondPool;

  try {
    await postgres.initialise();
    await postgres.start();
    await postgres.createDatabase(databaseName);

    const compiler = new DefaultDslCompiler();
    const envelopeFactory = new DefaultResultEnvelopeFactory();
    const fixture = createWebWorkerJobFixture();
    const compileResponse = await compiler.compile({
      sourcePlan: fixture.plan,
      envProfile: fixture.envProfile,
    });

    if (!compileResponse.compiledPlan) {
      throw new Error(`compile failed: ${compileResponse.issues.map((issue) => issue.message).join(', ')}`);
    }

    const replacementStep = compileResponse.compiledPlan.compiledSteps[1];
    if (!replacementStep) {
      throw new Error('expected a second compiled step for replacement');
    }

    const metadata = {
      jobId: fixture.jobId,
      runId: fixture.runId,
      runItemId: fixture.runItemId,
      attemptNo: fixture.attemptNo,
      tenantId: fixture.tenantId,
      projectId: fixture.projectId,
      traceId: fixture.traceId,
      correlationId: fixture.correlationId,
    };

    const stepResult = {
      compiledStepId: compileResponse.compiledPlan.compiledSteps[0].compiledStepId,
      sourceStepId: compileResponse.compiledPlan.compiledSteps[0].sourceStepId,
      status: 'passed',
      startedAt: '2026-03-07T10:00:00.000Z',
      finishedAt: '2026-03-07T10:00:00.250Z',
      durationMs: 250,
      attempts: 1,
      artifacts: [],
      extractedVariables: [],
    };

    const planResult = {
      compiledPlanId: compileResponse.compiledPlan.compiledPlanId,
      status: 'passed',
      startedAt: '2026-03-07T10:00:00.000Z',
      finishedAt: '2026-03-07T10:00:00.500Z',
      durationMs: 500,
      stepResults: [stepResult],
    };

    const jobResult = {
      metadata,
      status: 'executed',
      issues: [],
      planResult,
    };

    const stepEnvelope = envelopeFactory.buildStepResult(metadata, stepResult);
    const jobEnvelope = envelopeFactory.buildJobResult(jobResult);

    firstPool = new Pool({ connectionString });
    firstPool.on('error', () => {});
    const appliedMigrations = await runControlPlanePostgresMigrations(firstPool);
    firstStore = await PostgresControlPlaneStore.open({ pool: firstPool, runMigrations: false });
    firstServer = await startControlPlaneServer({ store: firstStore });

    const health = await fetch(`${firstServer.baseUrl}/healthz`).then((response) => response.json());
    const databaseSummary = await readDatabaseSummary(firstPool);
    const migrationsPayload = await fetch(`${firstServer.baseUrl}/api/v1/internal/migrations`).then((response) => response.json());

    const enqueueResponse = await fetch(`${firstServer.baseUrl}/api/v1/internal/jobs/${fixture.jobId}/steps/${replacementStep.sourceStepId}:override`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'replace',
        replacement_step: replacementStep,
      }),
    });

    const decisionResponse = await fetch(`${firstServer.baseUrl}/api/v1/agent/jobs/${fixture.jobId}/steps/${replacementStep.sourceStepId}:decide`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        job_id: fixture.jobId,
        run_id: fixture.runId,
        run_item_id: fixture.runItemId,
        attempt_no: fixture.attemptNo,
        tenant_id: fixture.tenantId,
        project_id: fixture.projectId,
        trace_id: fixture.traceId,
        correlation_id: fixture.correlationId,
        compiled_step_id: replacementStep.compiledStepId,
        source_step_id: replacementStep.sourceStepId,
        step_name: replacementStep.name,
        page_url: 'https://example.com/home',
        compiled_step: replacementStep,
      }),
    });
    const decisionPayload = await decisionResponse.json();

    const firstPost = await fetch(`${firstServer.baseUrl}/api/v1/internal/runner-results`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(stepEnvelope),
    });
    const duplicatePost = await fetch(`${firstServer.baseUrl}/api/v1/internal/runner-results`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(stepEnvelope),
    });
    const jobPost = await fetch(`${firstServer.baseUrl}/api/v1/internal/runner-results`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(jobEnvelope),
    });

    const [eventsPayload, runPayload, runItemPayload, stepEventsPayload] = await Promise.all([
      fetch(`${firstServer.baseUrl}/api/v1/internal/jobs/${fixture.jobId}/events`).then((response) => response.json()),
      fetch(`${firstServer.baseUrl}/api/v1/runs/${fixture.runId}`).then((response) => response.json()),
      fetch(`${firstServer.baseUrl}/api/v1/run-items/${fixture.runItemId}`).then((response) => response.json()),
      fetch(`${firstServer.baseUrl}/api/v1/internal/run-items/${fixture.runItemId}/step-events`).then((response) => response.json()),
    ]);
    const domainSummary = await readDomainSummary(firstPool, fixture);

    await firstServer.close();
    await firstStore.close();
    await firstPool.end();
    firstServer = undefined;
    firstStore = undefined;
    firstPool = undefined;

    await postgres.stop();
    await postgres.start();

    secondPool = new Pool({ connectionString });
    secondPool.on('error', () => {});
    secondStore = await PostgresControlPlaneStore.open({ pool: secondPool, runMigrations: false });
    secondServer = await startControlPlaneServer({ store: secondStore });

    const [restoredEventsPayload, restoredRunPayload, restoredRunItemPayload, restoredStepEventsPayload, restoredMigrationsPayload] = await Promise.all([
      fetch(`${secondServer.baseUrl}/api/v1/internal/jobs/${fixture.jobId}/events`).then((response) => response.json()),
      fetch(`${secondServer.baseUrl}/api/v1/runs/${fixture.runId}`).then((response) => response.json()),
      fetch(`${secondServer.baseUrl}/api/v1/run-items/${fixture.runItemId}`).then((response) => response.json()),
      fetch(`${secondServer.baseUrl}/api/v1/internal/run-items/${fixture.runItemId}/step-events`).then((response) => response.json()),
      fetch(`${secondServer.baseUrl}/api/v1/internal/migrations`).then((response) => response.json()),
    ]);
    const restoredDomainSummary = await readDomainSummary(secondPool, fixture);
    const restoredDatabaseSummary = await readDatabaseSummary(secondPool);
    const snapshot = await secondStore.snapshot();

    console.log(JSON.stringify({
      health,
      databaseSummary,
      appliedMigrationVersions: appliedMigrations.map((item) => item.version),
      migrationsCount: migrationsPayload.items.length,
      overrideAccepted: enqueueResponse.status === 202,
      decisionAction: decisionPayload.action,
      replacementSourceStepId: decisionPayload.replacement_step?.sourceStepId ?? null,
      firstPostStatus: firstPost.status,
      duplicatePostStatus: duplicatePost.status,
      duplicateBody: await duplicatePost.json(),
      jobPostStatus: jobPost.status,
      eventTypes: eventsPayload.items.map((item) => item.envelope.event_type),
      runApiStatus: runPayload.status,
      runItemApiStatus: runItemPayload.status,
      stepEventApiCount: stepEventsPayload.items.length,
      stepEventApiStepIds: stepEventsPayload.items.map((item) => item.source_step_id),
      domainSummary,
      restoredEventCount: restoredEventsPayload.items.length,
      restoredRunApiStatus: restoredRunPayload.status,
      restoredRunItemApiStatus: restoredRunItemPayload.status,
      restoredStepEventApiCount: restoredStepEventsPayload.items.length,
      restoredMigrationsCount: restoredMigrationsPayload.items.length,
      restoredDomainSummary,
      restoredDatabaseSummary,
      snapshotJobIds: Object.keys(snapshot.eventsByJob),
      pendingDecisionCount: Object.values(snapshot.pendingDecisionsByJob)
        .reduce((count, byStep) => count + Object.values(byStep).reduce((inner, queue) => inner + queue.length, 0), 0),
    }, null, 2));
  } finally {
    if (secondServer) {
      await secondServer.close();
    }
    if (secondStore) {
      await secondStore.close();
    }
    if (secondPool) {
      await secondPool.end();
    }
    if (firstServer) {
      await firstServer.close();
    }
    if (firstStore) {
      await firstStore.close();
    }
    if (firstPool) {
      await firstPool.end();
    }
    try {
      await postgres.stop();
    } catch {
      // Ignore cleanup errors when the embedded process is already down.
    }
    await rm(tempRoot, { recursive: true, force: true });
  }
};

await main();
