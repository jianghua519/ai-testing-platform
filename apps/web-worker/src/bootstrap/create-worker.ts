import { DefaultDslCompiler } from '@aiwtp/dsl-compiler';
import { RegistryBasedPlaywrightAdapter } from '@aiwtp/playwright-adapter';
import { WebJobRunner } from '../job-runner/web-job-runner.js';
import { NoopResultPublisher } from '../reporting/noop-publisher.js';
import { PlaywrightBrowserLauncher } from '../session/browser-launcher.js';

export const createWebWorker = (): WebJobRunner =>
  new WebJobRunner(
    new DefaultDslCompiler(),
    new RegistryBasedPlaywrightAdapter(),
    new NoopResultPublisher(),
    new PlaywrightBrowserLauncher(),
  );
