import type { WebWorkerJob } from '../job-runner/types.js';

export const createWebWorkerJobFixture = (): WebWorkerJob => ({
  jobId: 'job-1',
  tenantId: 'tenant-1',
  projectId: 'project-1',
  runId: 'run-1',
  runItemId: 'run-item-1',
  attemptNo: 0,
  traceId: 'trace-1',
  correlationId: 'corr-1',
  envProfile: {
    profileId: 'dev',
    browserProfile: {
      browser: 'chromium',
      headless: true,
      viewport: {
        width: 1440,
        height: 900,
      },
    },
  },
  plan: {
    planId: 'plan-1',
    planName: '两步导航流程',
    version: 'v1',
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
          value: 'https://example.com/home',
        },
      },
      {
        stepId: 'open-dashboard',
        name: '打开控制台',
        kind: 'navigation',
        action: 'open',
        input: {
          source: 'literal',
          value: 'https://example.com/dashboard-original',
        },
      },
    ],
  },
});
