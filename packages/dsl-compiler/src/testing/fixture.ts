import type { CompileRequest } from '../types.js';

export const createCompileFixture = (): CompileRequest => ({
  sourcePlan: {
    planId: 'login-plan',
    planName: '登录流程',
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
        stepId: 'open-login',
        name: '打开登录页',
        kind: 'navigation',
        action: 'open',
        timeoutMs: 5000,
      },
    ],
  },
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
});
