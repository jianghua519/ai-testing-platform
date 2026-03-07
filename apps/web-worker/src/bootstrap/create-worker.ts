import { DefaultDslCompiler } from '@aiwtp/dsl-compiler';
import { InMemoryStepController, RegistryBasedPlaywrightAdapter, type StepExecutionController } from '@aiwtp/playwright-adapter';
import { WebJobRunner } from '../job-runner/web-job-runner.js';
import { PlaywrightBrowserLauncher } from '../session/browser-launcher.js';
import { createResultPublisherFromEnv } from '../reporting/create-publisher.js';

export interface CreateWebWorkerOptions {
  controller?: StepExecutionController;
}

export const createWebWorker = (options: CreateWebWorkerOptions = {}): WebJobRunner =>
  new WebJobRunner(
    new DefaultDslCompiler(),
    new RegistryBasedPlaywrightAdapter(),
    createResultPublisherFromEnv(),
    new PlaywrightBrowserLauncher(),
    options.controller ?? new InMemoryStepController(),
  );
