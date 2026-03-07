import {
  createExecutionSession,
  type ExecutionSession,
  type StepExecutionController,
  type StepLifecycleObserver,
} from '@aiwtp/playwright-adapter';
import type { Browser } from 'playwright-core';
import type { CompiledWebPlan } from '@aiwtp/web-dsl-schema';

export interface SessionRuntimeOptions {
  controller?: StepExecutionController;
  observer?: StepLifecycleObserver;
}

export const openExecutionSession = async (
  browser: Browser,
  plan: CompiledWebPlan,
  options: SessionRuntimeOptions = {},
): Promise<ExecutionSession> =>
  createExecutionSession({
    browser,
    contextOptions: {
      viewport: plan.browserProfile.viewport,
      storageState: plan.browserProfile.storageStateRef,
    },
    variables: plan.runtimeVariables,
    controller: options.controller,
    observer: options.observer,
  });
