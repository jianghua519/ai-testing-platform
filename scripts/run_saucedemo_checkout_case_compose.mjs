import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Pool } from 'pg';
import { DefaultDslCompiler } from '../packages/dsl-compiler/dist/index.js';
import { RegistryBasedPlaywrightAdapter } from '../packages/playwright-adapter/dist/index.js';
import {
  HttpAgentControlPlaneClient,
  HttpResultPublisher,
  PollingWebAgent,
  PlaywrightBrowserLauncher,
  WebJobRunner,
} from '../apps/web-worker/dist/index.js';
import { buildTenantTable, createAuthHeaders, seedProjectMemberships } from './lib/control_plane_auth.mjs';
import { createSauceDemoCheckoutJob } from './run_saucedemo_checkout_sample.mjs';

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

const assertOk = (condition, message, details) => {
  if (!condition) {
    const suffix = details === undefined ? '' : `: ${JSON.stringify(details)}`;
    throw new Error(`${message}${suffix}`);
  }
};

const waitFor = async (fn, { timeoutMs = 120000, intervalMs = 500, label = 'condition' } = {}) => {
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

const main = async () => {
  await ensureArtifactBucket();

  const sampleJob = createSauceDemoCheckoutJob();
  const subjectId = '77777777-7777-7777-7777-777777777777';
  const authHeaders = createAuthHeaders({ subjectId, tenantId: sampleJob.tenantId });
  const testCasesTable = buildTenantTable(sampleJob.tenantId, 'test_cases');
  const versionsTable = buildTenantTable(sampleJob.tenantId, 'test_case_versions');
  const datasetRowsTable = buildTenantTable(sampleJob.tenantId, 'dataset_rows');
  const runsTable = buildTenantTable(sampleJob.tenantId, 'runs');
  const runItemsTable = buildTenantTable(sampleJob.tenantId, 'run_items');
  const stepEventsTable = buildTenantTable(sampleJob.tenantId, 'step_events');
  const artifactsTable = buildTenantTable(sampleJob.tenantId, 'artifacts');

  await seedProjectMemberships(pool, {
    tenantId: sampleJob.tenantId,
    subjectId,
    memberships: [{ projectId: sampleJob.projectId, roles: ['qa', 'operator'] }],
  });

  const createCaseResponse = await postJson('/api/v1/test-cases', {
    tenant_id: sampleJob.tenantId,
    project_id: sampleJob.projectId,
    name: sampleJob.plan.planName,
    plan: sampleJob.plan,
    env_profile: sampleJob.envProfile,
    version_label: sampleJob.plan.version,
    change_summary: 'seed from scripts/run_saucedemo_checkout_sample.mjs',
    publish: true,
    default_dataset: {
      name: 'default',
      values: {},
    },
  }, authHeaders);
  assertOk(
    createCaseResponse.status === 201,
    `expected create test case 201, got ${createCaseResponse.status}`,
    createCaseResponse.body,
  );

  const testCase = createCaseResponse.body.test_case;
  const version = createCaseResponse.body.version;
  const defaultDatasetRow = createCaseResponse.body.default_dataset_row;

  const agentClient = new HttpAgentControlPlaneClient({ baseUrl, timeoutMs: 5000 });
  const runner = new WebJobRunner(
    new DefaultDslCompiler(),
    new RegistryBasedPlaywrightAdapter(),
    new HttpResultPublisher({ endpoint: `${baseUrl}/api/v1/internal/runner-results`, timeoutMs: 15000 }),
    new PlaywrightBrowserLauncher(),
  );
  const agent = new PollingWebAgent(agentClient, runner, {
    agentId: '99999999-8888-7777-6666-555555555555',
    tenantId: sampleJob.tenantId,
    projectId: sampleJob.projectId,
    name: 'saucedemo-checkout-compose-agent',
    platform: 'linux',
    architecture: 'amd64',
    runtimeKind: 'container',
    capabilities: ['web', 'browser:chromium'],
    metadata: { source: 'saucedemo-checkout-case-compose' },
  }, {
    supportedJobKinds: ['web'],
    leaseTtlSeconds: 60,
    leaseHeartbeatIntervalMs: 500,
    maxParallelSlots: 1,
  });

  const enqueueRunResponse = await postJson('/api/v1/runs', {
    tenant_id: sampleJob.tenantId,
    project_id: sampleJob.projectId,
    name: `${sampleJob.plan.planName} case version execution`,
    mode: 'standard',
    selection: {
      kind: 'case_version',
      test_case_version_id: version.id,
    },
    execution_policy: {
      trace_id: sampleJob.traceId,
      correlation_id: sampleJob.correlationId,
    },
  }, authHeaders);
  assertOk(
    enqueueRunResponse.status === 201,
    `expected enqueue run 201, got ${enqueueRunResponse.status}`,
    enqueueRunResponse.body,
  );
  const runId = enqueueRunResponse.body.id;

  const agentPromise = agent.runUntilIdle(1);
  const completedRun = await waitFor(async () => {
    const response = await getJson(`/api/v1/runs/${runId}`, authHeaders);
    if (response.status !== 200) {
      return false;
    }
    return ['succeeded', 'failed', 'canceled'].includes(response.body.status) ? response.body : false;
  }, { timeoutMs: 300000, intervalMs: 1000, label: 'saucedemo case version run completion' });
  const agentCycles = await agentPromise;

  const runItemsResponse = await getJson(`/api/v1/run-items?run_id=${runId}&limit=20`, authHeaders);
  assertOk(
    runItemsResponse.status === 200,
    `expected list run items 200, got ${runItemsResponse.status}`,
    runItemsResponse.body,
  );
  assertOk(runItemsResponse.body.items.length === 1, `expected 1 run item, got ${runItemsResponse.body.items.length}`);
  const runItem = runItemsResponse.body.items[0];

  const runItemResponse = await getJson(`/api/v1/run-items/${runItem.id}`, authHeaders);
  assertOk(
    runItemResponse.status === 200,
    `expected get run item 200, got ${runItemResponse.status}`,
    runItemResponse.body,
  );

  const stepEventsResponse = await getJson(`/api/v1/internal/runs/${runId}/step-events?limit=200`);
  assertOk(
    stepEventsResponse.status === 200,
    `expected list step events 200, got ${stepEventsResponse.status}`,
    stepEventsResponse.body,
  );
  const artifactsResponse = await getJson(`/api/v1/internal/runs/${runId}/artifacts?limit=200`);
  assertOk(
    artifactsResponse.status === 200,
    `expected list run artifacts 200, got ${artifactsResponse.status}`,
    artifactsResponse.body,
  );

  const failedStep = stepEventsResponse.body.items.find((item) => item.status !== 'passed') ?? null;

  const [testCaseRowResult, versionRowResult, datasetRowResult, runRowResult, runItemRowResult, stepEventCountResult, artifactCountResult] = await Promise.all([
    pool.query(
      `select name, status, latest_version_id, latest_published_version_id
       from ${testCasesTable}
       where test_case_id = $1`,
      [testCase.id],
    ),
    pool.query(
      `select test_case_version_id, status
       from ${versionsTable}
       where test_case_version_id = $1`,
      [version.id],
    ),
    pool.query(
      `select dataset_row_id, status, values_json
       from ${datasetRowsTable}
       where dataset_row_id = $1`,
      [defaultDatasetRow.id],
    ),
    pool.query(
      `select run_id, status, selection_kind
       from ${runsTable}
       where run_id = $1`,
      [runId],
    ),
    pool.query(
      `select run_item_id, status, test_case_version_id, dataset_row_id, input_snapshot_json
       from ${runItemsTable}
       where run_item_id = $1`,
      [runItem.id],
    ),
    pool.query(
      `select count(*)::int as step_event_count
       from ${stepEventsTable}
       where run_id = $1`,
      [runId],
    ),
    pool.query(
      `select count(*)::int as artifact_count
       from ${artifactsTable}
       where run_id = $1`,
      [runId],
    ),
  ]);

  assertOk(testCaseRowResult.rows[0]?.status === 'active', 'expected persisted test case to be active');
  assertOk(testCaseRowResult.rows[0]?.latest_published_version_id === version.id, 'expected latest published version id to match created version');
  assertOk(versionRowResult.rows[0]?.status === 'published', 'expected persisted case version to be published');
  assertOk(datasetRowResult.rows[0]?.status === 'active', 'expected persisted dataset row to be active');
  assertOk(Object.keys(datasetRowResult.rows[0]?.values_json ?? {}).length === 0, 'expected empty dataset row values for literal-only sample');
  assertOk(runRowResult.rows[0]?.selection_kind === 'case_version', 'expected case_version run selection_kind');
  assertOk(runItemRowResult.rows[0]?.test_case_version_id === version.id, 'expected run item row to point at created case version');
  assertOk(runItemRowResult.rows[0]?.dataset_row_id === defaultDatasetRow.id, 'expected run item row to use default dataset row');
  assertOk(Object.keys(runItemRowResult.rows[0]?.input_snapshot_json ?? {}).length === 0, 'expected empty input snapshot for literal-only sample');
  assertOk(stepEventCountResult.rows[0]?.step_event_count >= 1, 'expected persisted step events');
  assertOk(artifactCountResult.rows[0]?.artifact_count >= 1, 'expected persisted artifacts');

  assertOk(
    completedRun.status === 'succeeded',
    failedStep
      ? `expected succeeded run, got ${completedRun.status} at step ${failedStep.source_step_id}: ${failedStep.error_code ?? 'UNKNOWN'} ${failedStep.error_message ?? ''}`
      : `expected succeeded run, got ${completedRun.status}`,
  );

  console.log(JSON.stringify({
    status: 'ok',
    testCaseId: testCase.id,
    versionId: version.id,
    defaultDatasetRowId: defaultDatasetRow.id,
    runId,
    runItemId: runItem.id,
    runStatus: completedRun.status,
    stepEventCount: stepEventsResponse.body.items.length,
    artifactCount: artifactsResponse.body.items.length,
    failedStep: failedStep ? {
      sourceStepId: failedStep.source_step_id,
      status: failedStep.status,
      errorCode: failedStep.error_code,
      errorMessage: failedStep.error_message,
    } : null,
    agentCycleStatuses: agentCycles.map((cycle) => cycle.status),
  }, null, 2));
};

try {
  await main();
} finally {
  await pool.end();
}
