import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Pool } from 'pg';

import { DefaultDslCompiler } from '../packages/dsl-compiler/dist/index.js';
import { RegistryBasedPlaywrightAdapter } from '../packages/playwright-adapter/dist/index.js';
import {
  HttpAgentControlPlaneClient,
  HttpResultPublisher,
  HttpStepController,
  PollingWebAgent,
  PlaywrightBrowserLauncher,
  WebJobRunner,
} from '../apps/web-worker/dist/index.js';
import { startProfileFormTargetServer } from './lib/profile_form_target.mjs';
import { createAuthHeaders, seedProjectMemberships } from './lib/control_plane_auth.mjs';

const aiBaseUrl = process.env.AI_ORCHESTRATOR_BASE_URL ?? 'http://ai-orchestrator:8081';
const controlPlaneBaseUrl = process.env.CONTROL_PLANE_BASE_URL ?? 'http://control-plane:8080';
const connectionString = process.env.CONTROL_PLANE_DATABASE_URL;
if (!connectionString) {
  throw new Error('CONTROL_PLANE_DATABASE_URL is required');
}

const pool = new Pool({ connectionString });

const tenantId = 'tenant-ai-workflow';
const projectId = 'project-ai-workflow';
const subjectId = 'assistant-workflow-user';
const targetHostAlias = process.env.AI_ORCHESTRATOR_TARGET_HOST_ALIAS ?? 'tools';
const uploadFilePath = process.env.AI_ORCHESTRATOR_SCRIPTED_UPLOAD_PATH ?? '/tmp/ai-orchestrator-avatar-smoke.txt';

const assertOk = (condition, message) => {
  assert.equal(condition, true, message);
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
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  if (lastError) {
    throw lastError;
  }
  throw new Error(`timed out waiting for ${label}`);
};

const waitForAssistantActionWithAgent = async (agent, requestFactory, {
  timeoutMs = 120000,
  pollIntervalMs = 250,
  label = 'assistant action',
} = {}) => {
  let settled = false;
  let result;
  let error;
  const pending = requestFactory()
    .then((value) => {
      settled = true;
      result = value;
    })
    .catch((cause) => {
      settled = true;
      error = cause;
    });

  const deadline = Date.now() + timeoutMs;
  while (!settled && Date.now() < deadline) {
    await agent.runOnce();
    if (!settled) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  await pending;
  if (!settled) {
    throw new Error(`timed out waiting for ${label}`);
  }
  if (error) {
    throw error;
  }
  return result;
};

const driveAgentUntil = async (agent, condition, {
  timeoutMs = 120000,
  pollIntervalMs = 250,
  label = 'agent-driven condition',
} = {}) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await condition();
    if (value) {
      return value;
    }
    await agent.runOnce();
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`timed out waiting for ${label}`);
};

const getJson = async (baseUrl, pathname, headers = {}) => {
  const response = await fetch(new URL(pathname, baseUrl), { headers });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
};

const postJson = async (baseUrl, pathname, payload = {}, headers = {}) => {
  const response = await fetch(new URL(pathname, baseUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
};

const targetServer = await startProfileFormTargetServer({
  bindHost: '0.0.0.0',
  publicHost: targetHostAlias,
});

const authHeaders = createAuthHeaders({ subjectId, tenantId });

const buildAgent = () => {
  const agentClient = new HttpAgentControlPlaneClient({ baseUrl: controlPlaneBaseUrl, timeoutMs: 5000 });
  const runner = new WebJobRunner(
    new DefaultDslCompiler(),
    new RegistryBasedPlaywrightAdapter(),
    new HttpResultPublisher({ endpoint: `${controlPlaneBaseUrl}/api/v1/internal/runner-results`, timeoutMs: 5000 }),
    new PlaywrightBrowserLauncher(),
    {
      create(metadata) {
        return new HttpStepController(metadata, {
          endpoint: `${controlPlaneBaseUrl}/api/v1/agent/jobs/{job_id}/steps/{source_step_id}:decide`,
          timeoutMs: 5000,
          failOpen: false,
        });
      },
    },
  );

  return new PollingWebAgent(agentClient, runner, {
    agentId: '11111111-3333-5555-7777-999999999999',
    tenantId,
    projectId,
    name: 'ai-orchestrator-workflow-agent',
    platform: 'linux',
    architecture: 'amd64',
    runtimeKind: 'container',
    capabilities: ['web', 'browser:chromium'],
    metadata: { source: 'ai-orchestrator-workflow-smoke' },
  }, {
    supportedJobKinds: ['web'],
    leaseTtlSeconds: 30,
    leaseHeartbeatIntervalMs: 250,
    maxParallelSlots: 1,
  });
};

try {
  await mkdir(path.dirname(uploadFilePath), { recursive: true });
  await writeFile(uploadFilePath, 'avatar smoke\n', 'utf8');

  await seedProjectMemberships(pool, {
    tenantId,
    subjectId,
    memberships: [{ projectId, roles: ['qa', 'operator'] }],
  });

  const health = await getJson(aiBaseUrl, '/healthz');
  assertOk(health.status === 200, 'healthz should succeed');
  assertOk(health.body.provider === 'google', `expected google provider, got ${health.body.provider}`);

  const createThread = await postJson(aiBaseUrl, '/api/v1/assistant/threads', {
    title: 'ai orchestrator workflow smoke thread',
    tenantId,
    projectId,
    userId: subjectId,
  });
  assertOk(createThread.status === 201, 'assistant thread creation failed');
  const threadId = createThread.body.thread.id;

  const assistantCheck = await postJson(aiBaseUrl, `/api/v1/assistant/threads/${threadId}/messages`, {
    content: '请用一句话确认你已经连接到真实 Google 模型，并且当前不需要触发 exploration、publish 或 self-heal。',
  });
  assertOk(assistantCheck.status === 200, 'assistant real-model check failed');
  assertOk(
    typeof assistantCheck.body.assistantMessage?.content === 'string'
      && assistantCheck.body.assistantMessage.content.trim().length > 0,
    'assistant real-model check returned empty content',
  );

  const createExploration = await postJson(aiBaseUrl, '/api/v1/explorations', {
    tenantId,
    projectId,
    userId: subjectId,
    threadId,
    name: 'ai orchestrator workflow smoke exploration',
    startUrl: `${targetServer.getBaseUrl(targetHostAlias)}/home`,
    instruction: '打开资料页面，填写 Display Name=Smoke User，上传 Avatar=avatar-smoke.txt，保存后确认页面显示已保存。',
    executionMode: 'scripted',
    scriptProfile: 'profile_form',
  });
  assertOk(createExploration.status === 201, 'create exploration failed');
  const explorationId = createExploration.body.exploration.id;

  const startExploration = await postJson(aiBaseUrl, `/api/v1/explorations/${explorationId}:start`, {
    subjectId,
  });
  assertOk(startExploration.status === 200, 'start exploration failed');

  const stopExploration = await postJson(aiBaseUrl, `/api/v1/explorations/${explorationId}:stop`, {});
  assertOk(stopExploration.status === 200, 'stop exploration failed');

  const explorationResponse = await getJson(aiBaseUrl, `/api/v1/explorations/${explorationId}`);
  assertOk(explorationResponse.status === 200, 'get exploration failed');
  const exploration = explorationResponse.body.exploration;
  assertOk(exploration.status === 'succeeded', `unexpected exploration status: ${exploration.status}`);
  assertOk(Boolean(exploration.recordingId), 'exploration recordingId missing');
  assertOk(exploration.artifacts.length >= 1, 'expected at least one exploration artifact');

  const publishCase = await postJson(aiBaseUrl, `/api/v1/explorations/${explorationId}:publish-test-case`, {
    subjectId,
    name: 'workflow exploration case',
    versionLabel: 'workflow-v1',
    changeSummary: 'published from exploration workflow smoke',
    publish: true,
  });
  assertOk(publishCase.status === 201, 'publish exploration case failed');
  const testCaseId = publishCase.body.testCaseId;
  const originalVersionId = publishCase.body.versionId;

  const originalVersionResponse = await getJson(
    controlPlaneBaseUrl,
    `/api/v1/test-case-versions/${originalVersionId}`,
    authHeaders,
  );
  assertOk(originalVersionResponse.status === 200, 'get original case version failed');

  const brokenPlan = structuredClone(originalVersionResponse.body.plan);
  brokenPlan.steps = brokenPlan.steps.map((step) =>
    step.action === 'click' && step.locator?.value === '保存资料'
      ? {
        ...step,
        locator: {
          strategy: 'text',
          value: '保存资料-错误',
        },
      }
      : step);

  const createBrokenVersion = await postJson(
    controlPlaneBaseUrl,
    `/api/v1/test-cases/${testCaseId}/versions`,
    {
      plan: brokenPlan,
      env_profile: originalVersionResponse.body.env_profile,
      version_label: 'workflow-broken-v1',
      change_summary: 'introduce locator drift for self-heal smoke',
      publish: false,
      default_dataset: {
        name: 'workflow-broken-default',
        values: exploration.sampleDataset,
      },
    },
    authHeaders,
  );
  assertOk(createBrokenVersion.status === 201, 'create broken case version failed');
  const brokenVersionId = createBrokenVersion.body.version.id;

  const agent = buildAgent();
  const createBrokenRun = await postJson(controlPlaneBaseUrl, '/api/v1/runs', {
    tenant_id: tenantId,
    project_id: projectId,
    name: 'workflow broken run',
    mode: 'standard',
    selection: {
      kind: 'case_version',
      test_case_version_id: brokenVersionId,
    },
  }, authHeaders);
  assertOk(createBrokenRun.status === 201, 'create broken run failed');
  const brokenRunId = createBrokenRun.body.id;

  const brokenRun = await driveAgentUntil(agent, async () => {
    const response = await getJson(controlPlaneBaseUrl, `/api/v1/runs/${brokenRunId}`, authHeaders);
    if (response.status !== 200) {
      return false;
    }
    return ['failed', 'succeeded', 'canceled'].includes(response.body.status) ? response.body : false;
  }, { label: 'broken run completion' });
  assertOk(brokenRun.status === 'failed', `expected broken run to fail, got ${brokenRun.status}`);

  const brokenRunItems = await getJson(controlPlaneBaseUrl, `/api/v1/run-items?run_id=${brokenRunId}&limit=20`, authHeaders);
  assertOk(brokenRunItems.status === 200, 'list broken run items failed');
  const brokenRunItemId = brokenRunItems.body.items[0].id;

  const initialEvaluation = await postJson(aiBaseUrl, `/api/v1/run-items/${brokenRunItemId}:evaluate`, {
    subjectId,
    tenantId,
  });
  assertOk(initialEvaluation.status === 201, 'initial run evaluation failed');
  assertOk(
    initialEvaluation.body.runEvaluation.verdict === 'failed_test_asset_issue',
    `unexpected initial evaluation verdict: ${initialEvaluation.body.runEvaluation.verdict}`,
  );

  const selfHealResponse = await waitForAssistantActionWithAgent(
    agent,
    () => postJson(aiBaseUrl, `/api/v1/run-items/${brokenRunItemId}:self-heal`, {
      subjectId,
      tenantId,
      deriveDraftVersionOnSuccess: true,
    }),
    { label: 'run item self-heal response' },
  );
  assertOk(selfHealResponse.status === 200, 'run item self-heal failed');
  assertOk(typeof selfHealResponse.body.selfHealAttempt?.replayRunId === 'string', 'self-heal replay run id missing');

  const replayRunId = selfHealResponse.body.selfHealAttempt.replayRunId;
  const replayRun = await getJson(controlPlaneBaseUrl, `/api/v1/runs/${replayRunId}`, authHeaders);
  assertOk(replayRun.status === 200, 'get replay run failed');
  assertOk(replayRun.body.status === 'succeeded', `expected replay run succeeded, got ${replayRun.body.status}`);

  const replayRunItems = await getJson(controlPlaneBaseUrl, `/api/v1/run-items?run_id=${replayRunId}&limit=20`, authHeaders);
  assertOk(replayRunItems.status === 200, 'list replay run items failed');
  const replayRunItemId = replayRunItems.body.items[0].id;

  const evaluationResponse = await postJson(aiBaseUrl, `/api/v1/run-items/${replayRunItemId}:evaluate`, {
    subjectId,
    tenantId,
  });
  assertOk(evaluationResponse.status === 201, 'run item evaluation failed');
  const evaluationId = evaluationResponse.body.runEvaluation.id;

  const evaluationDetail = await getJson(aiBaseUrl, `/api/v1/run-evaluations/${evaluationId}`);
  assertOk(evaluationDetail.status === 200, 'get run evaluation failed');
  assertOk(
    evaluationDetail.body.runEvaluation.verdict === 'passed_with_runtime_self_heal',
    `unexpected replay evaluation verdict: ${evaluationDetail.body.runEvaluation.verdict}`,
  );

  assertOk(targetServer.submissions.length >= 2, `expected at least 2 successful submissions, got ${targetServer.submissions.length}`);
  assertOk(
    targetServer.submissions[targetServer.submissions.length - 1]?.displayName === 'Smoke User',
    'unexpected latest submission displayName',
  );

  console.log(JSON.stringify({
    status: 'ok',
    provider: health.body.provider,
    model: health.body.model,
    threadId,
    assistantCheckPreview: assistantCheck.body.assistantMessage.content,
    explorationId,
    recordingId: exploration.recordingId,
    explorationArtifactCount: exploration.artifacts.length,
    testCaseId,
    originalVersionId,
    brokenVersionId,
    brokenRunId,
    brokenRunItemId,
    replayRunId,
    replayRunItemId,
    evaluationId,
    evaluationVerdict: evaluationDetail.body.runEvaluation.verdict,
    submissionCount: targetServer.submissions.length,
  }, null, 2));
} finally {
  await targetServer.close().catch(() => {});
  await pool.end().catch(() => {});
}
