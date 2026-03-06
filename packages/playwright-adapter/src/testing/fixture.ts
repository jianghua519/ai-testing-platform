import type { CompiledWebPlan } from '@aiwtp/web-dsl-schema';

export const createCompiledPlanFixture = (): CompiledWebPlan => ({
  compiledPlanId: 'compiled-login-plan',
  sourcePlanId: 'login-plan',
  sourceVersion: 'v1',
  browserProfile: {
    browser: 'chromium',
    headless: true,
    viewport: {
      width: 1440,
      height: 900,
    },
  },
  runtimeVariables: {},
  compiledSteps: [
    {
      compiledStepId: 'compiled-open-login',
      sourceStepId: 'open-login',
      name: '打开登录页',
      kind: 'navigation',
      action: 'open',
      executeMode: 'single',
      inputResolved: {
        source: 'literal',
        value: 'https://example.com/login',
        isRuntimeBound: false,
      },
      expectations: [],
      timeoutMs: 5000,
      retryPolicy: {
        maxAttempts: 1,
        intervalMs: 0,
        backoff: 'fixed',
      },
      artifactPolicy: {
        screenshot: 'on_failure',
        trace: 'on_failure',
        video: 'none',
        domSnapshot: false,
        networkCapture: false,
      },
      runtimeHooks: [],
      children: [],
    },
  ],
  compileDigest: {
    sourcePlanId: 'login-plan',
    sourceVersion: 'v1',
    compilerVersion: '0.1.0',
    compiledAt: new Date(0).toISOString(),
    normalizedStepCount: 1,
    warningCount: 0,
  },
});
