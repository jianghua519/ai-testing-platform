import type { Browser, BrowserContext, BrowserContextOptions, Page } from 'playwright-core';
import { NoopArtifactCollector } from '../artifacts/artifact-collector.js';
import { SystemExecutionClock } from './clock.js';
import { MemoryRuntimeVariableStore } from './variable-store.js';
import type { ExecutionSession } from '../types.js';

export interface SessionFactoryOptions {
  browser: Browser;
  contextOptions?: BrowserContextOptions;
  variables?: Record<string, unknown>;
}

export const createExecutionSession = async ({ browser, contextOptions, variables }: SessionFactoryOptions): Promise<ExecutionSession> => {
  const context: BrowserContext = await browser.newContext(contextOptions);
  const page: Page = await context.newPage();
  return {
    browser,
    context,
    page,
    variables: new MemoryRuntimeVariableStore(variables),
    artifacts: new NoopArtifactCollector(),
    clock: new SystemExecutionClock(),
  };
};
