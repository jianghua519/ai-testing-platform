import { newDb } from 'pg-mem';
import {
  PostgresControlPlaneStore,
  startControlPlaneServer,
} from '../apps/control-plane/dist/index.js';
import {
  DefaultResultEnvelopeFactory,
  createWebWorkerJobFixture,
} from '../apps/web-worker/dist/index.js';
import { DefaultDslCompiler } from '../packages/dsl-compiler/dist/index.js';
import { buildTenantTable } from './lib/control_plane_auth.mjs';

const readDomainSummary = async (pool, fixture) => {
  const runsTable = buildTenantTable(fixture.tenantId, 'runs');
  const runItemsTable = buildTenantTable(fixture.tenantId, 'run_items');
  const stepEventsTable = buildTenantTable(fixture.tenantId, 'step_events');
  const stepDecisionsTable = buildTenantTable(fixture.tenantId, 'step_decisions');
  const runnerEventsTable = buildTenantTable(fixture.tenantId, 'control_plane_runner_events');
  const [runs, runItems, stepEvents, stepDecisions, rawEvents] = await Promise.all([
    pool.query(`select run_id, status, last_event_id from ${runsTable} where run_id = $1`, [fixture.runId]),
    pool.query(`select run_item_id, status, last_event_id from ${runItemsTable} where run_item_id = $1`, [fixture.runItemId]),
    pool.query(`select source_step_id, status from ${stepEventsTable} where run_item_id = $1 order by received_at asc`, [fixture.runItemId]),
    pool.query(
      `select
         count(*)::int as total_count,
         sum(case when consumed_at is not null then 1 else 0 end)::int as consumed_count,
         min(run_id) as run_id,
         min(run_item_id) as run_item_id
       from ${stepDecisionsTable}
       where job_id = $1`,
      [fixture.jobId],
    ),
    pool.query(`select count(*)::int as total_count from ${runnerEventsTable} where job_id = $1`, [fixture.jobId]),
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

const main = async () => {
  const database = newDb();
  const { Pool } = database.adapters.createPg();
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
    artifacts: [],
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

  const firstPool = new Pool();
  const firstStore = await PostgresControlPlaneStore.open({ pool: firstPool, autoMigrate: true });
  const firstServer = await startControlPlaneServer({ store: firstStore });
  let firstServerClosed = false;

  let secondPool;
  let secondStore;
  let secondServer;

  try {
    const health = await fetch(`${firstServer.baseUrl}/healthz`).then((response) => response.json());

    const enqueueResponse = await fetch(`${firstServer.baseUrl}/api/v1/internal/jobs/${fixture.jobId}/steps/${replacementStep.sourceStepId}:override`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'replace',
        replacement_step: replacementStep,
        tenant_id: fixture.tenantId,
        run_id: fixture.runId,
        run_item_id: fixture.runItemId,
      }),
    });
    if (enqueueResponse.status !== 202) {
      throw new Error(`override expected 202, got ${enqueueResponse.status}: ${await enqueueResponse.text()}`);
    }

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
    if (decisionResponse.status !== 200) {
      throw new Error(`decide expected 200, got ${decisionResponse.status}: ${await decisionResponse.text()}`);
    }
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

    const eventsPayload = await fetch(`${firstServer.baseUrl}/api/v1/internal/jobs/${fixture.jobId}/events`).then((response) => response.json());
    const domainSummary = await readDomainSummary(firstPool, fixture);

    await firstServer.close();
    firstServerClosed = true;

    secondPool = new Pool();
    secondStore = await PostgresControlPlaneStore.open({ pool: secondPool, autoMigrate: false });
    secondServer = await startControlPlaneServer({ store: secondStore });

    const restoredEventsPayload = await fetch(`${secondServer.baseUrl}/api/v1/internal/jobs/${fixture.jobId}/events`).then((response) => response.json());
    const restoredDomainSummary = await readDomainSummary(secondPool, fixture);
    const snapshot = await secondStore.snapshot();

    console.log(JSON.stringify({
      health,
      overrideAccepted: enqueueResponse.status === 202,
      decisionAction: decisionPayload.action,
      replacementSourceStepId: decisionPayload.replacement_step?.sourceStepId ?? null,
      firstPostStatus: firstPost.status,
      duplicatePostStatus: duplicatePost.status,
      duplicateBody: await duplicatePost.json(),
      jobPostStatus: jobPost.status,
      eventTypes: eventsPayload.items.map((item) => item.envelope.event_type),
      domainSummary,
      restoredEventCount: restoredEventsPayload.items.length,
      restoredDomainSummary,
      snapshotJobIds: Object.keys(snapshot.eventsByJob),
      pendingDecisionCount: Object.values(snapshot.pendingDecisionsByJob)
        .reduce((count, byStep) => count + Object.values(byStep).reduce((inner, queue) => inner + queue.length, 0), 0),
    }, null, 2));
  } finally {
    if (secondServer) {
      await secondServer.close();
    } else if (!firstServerClosed) {
      await firstServer.close();
    }
    await secondPool?.end();
    await firstPool.end();
  }
};

await main();
