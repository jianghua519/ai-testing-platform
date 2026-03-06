import { DefaultDslCompiler } from '@aiwtp/dsl-compiler';
import { RegistryBasedPlaywrightAdapter } from '@aiwtp/playwright-adapter';
import { WebJobRunner } from '../job-runner/web-job-runner.js';
import { PlaywrightBrowserLauncher } from '../session/browser-launcher.js';
import { createResultPublisherFromEnv } from '../reporting/create-publisher.js';

export const createWebWorker = (): WebJobRunner =>
  new WebJobRunner(
    new DefaultDslCompiler(),
    new RegistryBasedPlaywrightAdapter(),
    createResultPublisherFromEnv(),
    new PlaywrightBrowserLauncher(),
  );
