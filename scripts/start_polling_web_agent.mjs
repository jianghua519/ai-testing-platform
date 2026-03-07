import os from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  HttpAgentControlPlaneClient,
  PollingWebAgent,
  createWebWorker,
} from '../apps/web-worker/dist/index.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const baseUrl = process.env.CONTROL_PLANE_BASE_URL ?? 'http://127.0.0.1:8080';
const pollIntervalMs = Number.parseInt(process.env.WEB_AGENT_POLL_INTERVAL_MS ?? '1000', 10);
const maxIdleIterations = Number.parseInt(process.env.WEB_AGENT_MAX_IDLE_ITERATIONS ?? '0', 10);
const maxParallelSlots = Number.parseInt(process.env.WEB_AGENT_MAX_PARALLEL_SLOTS ?? '1', 10);
const supportedJobKinds = (process.env.WEB_AGENT_SUPPORTED_JOB_KINDS ?? 'web')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const browserCapabilities = (process.env.WEB_AGENT_BROWSERS ?? 'chromium')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean)
  .map((value) => `browser:${value}`);
const explicitCapabilities = (process.env.WEB_AGENT_CAPABILITIES ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const capabilities = Array.from(new Set([
  ...supportedJobKinds,
  ...browserCapabilities,
  ...explicitCapabilities,
]));

process.env.WEB_WORKER_RESULT_PUBLISH_MODE ??= 'http';
process.env.WEB_WORKER_RESULT_PUBLISH_ENDPOINT ??= `${baseUrl}/api/v1/internal/runner-results`;
process.env.WEB_WORKER_STEP_CONTROL_MODE ??= 'http';
process.env.WEB_WORKER_STEP_CONTROL_ENDPOINT ??= `${baseUrl}/api/v1/agent/jobs/{job_id}/steps/{source_step_id}:decide`;
process.env.WEB_WORKER_STEP_CONTROL_FAIL_OPEN ??= 'true';

const agent = new PollingWebAgent(
  new HttpAgentControlPlaneClient({ baseUrl, timeoutMs: 5000 }),
  createWebWorker(),
  {
    agentId: process.env.WEB_AGENT_ID ?? randomUUID(),
    tenantId: process.env.WEB_AGENT_TENANT_ID ?? '22222222-2222-2222-2222-222222222222',
    projectId: process.env.WEB_AGENT_PROJECT_ID ?? '33333333-3333-3333-3333-333333333333',
    name: process.env.WEB_AGENT_NAME ?? `${os.hostname()}-web-agent`,
    platform: process.env.WEB_AGENT_PLATFORM ?? process.platform,
    architecture: process.env.WEB_AGENT_ARCHITECTURE ?? process.arch,
    runtimeKind: process.env.WEB_AGENT_RUNTIME_KIND ?? 'host',
    capabilities,
    maxParallelSlots,
    metadata: {
      source: 'start_polling_web_agent',
      hostname: os.hostname(),
    },
  },
  {
    supportedJobKinds,
    maxParallelSlots,
    leaseTtlSeconds: Number.parseInt(process.env.WEB_AGENT_LEASE_TTL_SECONDS ?? '60', 10),
    leaseHeartbeatIntervalMs: Number.parseInt(process.env.WEB_AGENT_LEASE_HEARTBEAT_INTERVAL_MS ?? '10000', 10),
  },
);

let stopping = false;
process.on('SIGINT', () => {
  stopping = true;
});
process.on('SIGTERM', () => {
  stopping = true;
});

const results = [];
let idleCount = 0;
while (!stopping) {
  const cycles = await agent.runSlotsOnce();
  results.push(...cycles);
  for (const cycle of cycles) {
    console.log(JSON.stringify(cycle, null, 2));
  }

  if (cycles.every((cycle) => cycle.status === 'idle')) {
    idleCount += 1;
    if (maxIdleIterations > 0 && idleCount >= maxIdleIterations) {
      break;
    }
    await sleep(pollIntervalMs);
    continue;
  }

  idleCount = 0;
}

console.log(JSON.stringify({ status: 'stopped', cycleCount: results.length }, null, 2));
