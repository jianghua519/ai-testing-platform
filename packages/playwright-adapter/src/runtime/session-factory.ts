import type { Browser, BrowserContext, BrowserContextOptions, Page } from 'playwright-core';
import { NoopArtifactCollector } from '../artifacts/artifact-collector.js';
import { SystemExecutionClock } from './clock.js';
import { MemoryRuntimeVariableStore } from './variable-store.js';
import type { ExecutionSession, StepExecutionController, StepLifecycleObserver } from '../types.js';

export interface SessionFactoryOptions {
  browser: Browser;
  contextOptions?: BrowserContextOptions;
  variables?: Record<string, unknown>;
  controller?: StepExecutionController;
  observer?: StepLifecycleObserver;
}

export const createExecutionSession = async ({ browser, contextOptions, variables, controller, observer }: SessionFactoryOptions): Promise<ExecutionSession> => {
  const context: BrowserContext = await browser.newContext(contextOptions);
  const page: Page = await context.newPage();
  return {
    browser,
    context,
    page,
    variables: new MemoryRuntimeVariableStore(variables),
    artifacts: new NoopArtifactCollector(),
    clock: new SystemExecutionClock(),
    controller,
    observer,
  };
};
