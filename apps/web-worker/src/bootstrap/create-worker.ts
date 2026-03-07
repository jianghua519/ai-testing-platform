import { DefaultDslCompiler } from '@aiwtp/dsl-compiler';
import { RegistryBasedPlaywrightAdapter, type StepExecutionController } from '@aiwtp/playwright-adapter';
import { WebJobRunner } from '../job-runner/web-job-runner.js';
import { PlaywrightBrowserLauncher } from '../session/browser-launcher.js';
import { createResultPublisherFromEnv } from '../reporting/create-publisher.js';
import { createStepControllerFactoryFromEnv } from '../control/create-controller.js';
import type { StepControllerFactory, StepControllerProvider } from '../control/types.js';

export interface CreateWebWorkerOptions {
  controller?: StepExecutionController;
  controllerFactory?: StepControllerFactory;
}

const resolveControllerProvider = (options: CreateWebWorkerOptions): StepControllerProvider =>
  options.controllerFactory ?? options.controller ?? createStepControllerFactoryFromEnv();

export const createWebWorker = (options: CreateWebWorkerOptions = {}): WebJobRunner =>
  new WebJobRunner(
    new DefaultDslCompiler(),
    new RegistryBasedPlaywrightAdapter(),
    createResultPublisherFromEnv(),
    new PlaywrightBrowserLauncher(),
    resolveControllerProvider(options),
  );
