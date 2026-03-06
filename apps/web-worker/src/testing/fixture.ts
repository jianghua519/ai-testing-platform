import type { WebWorkerJob } from '../job-runner/types.js';

export const createWebWorkerJobFixture = (): WebWorkerJob => ({
  jobId: 'job-1',
  tenantId: 'tenant-1',
  projectId: 'project-1',
  runId: 'run-1',
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
    planName: '打开首页',
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
          value: 'https://example.com',
        },
      },
    ],
  },
});
