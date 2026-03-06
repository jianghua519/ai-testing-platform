import { createExecutionSession, type ExecutionSession } from '@aiwtp/playwright-adapter';
import type { Browser } from 'playwright-core';
import type { CompiledWebPlan } from '@aiwtp/web-dsl-schema';

export const openExecutionSession = async (browser: Browser, plan: CompiledWebPlan): Promise<ExecutionSession> =>
  createExecutionSession({
    browser,
    contextOptions: {
      viewport: plan.browserProfile.viewport,
      storageState: plan.browserProfile.storageStateRef,
    },
    variables: plan.runtimeVariables,
  });
