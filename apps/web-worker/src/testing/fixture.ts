import type { WebWorkerJob } from '../job-runner/types.js';

export const createWebWorkerJobFixture = (): WebWorkerJob => ({
  jobId: '11111111-1111-1111-1111-111111111111',
  tenantId: '22222222-2222-2222-2222-222222222222',
  projectId: '33333333-3333-3333-3333-333333333333',
  runId: '44444444-4444-4444-4444-444444444444',
  runItemId: '55555555-5555-5555-5555-555555555555',
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
