import { InMemoryStepController } from '@aiwtp/playwright-adapter';
import { HttpStepController } from './http-step-controller.js';
import type { StepControllerFactory } from './types.js';

export const createStepControllerFactoryFromEnv = (env: NodeJS.ProcessEnv = process.env): StepControllerFactory => {
  const mode = env.WEB_WORKER_STEP_CONTROL_MODE ?? 'inmemory';

  if (mode === 'http') {
    const endpoint = env.WEB_WORKER_STEP_CONTROL_ENDPOINT;
    if (!endpoint) {
      throw new Error('WEB_WORKER_STEP_CONTROL_ENDPOINT is required when WEB_WORKER_STEP_CONTROL_MODE=http');
    }

    return {
      create(metadata) {
        return new HttpStepController(metadata, {
          endpoint,
          timeoutMs: env.WEB_WORKER_STEP_CONTROL_TIMEOUT_MS ? Number(env.WEB_WORKER_STEP_CONTROL_TIMEOUT_MS) : 5000,
          authToken: env.WEB_WORKER_STEP_CONTROL_AUTH_TOKEN,
          pausePollIntervalMs: env.WEB_WORKER_STEP_CONTROL_PAUSE_POLL_INTERVAL_MS
            ? Number(env.WEB_WORKER_STEP_CONTROL_PAUSE_POLL_INTERVAL_MS)
            : 500,
          failOpen: env.WEB_WORKER_STEP_CONTROL_FAIL_OPEN === 'true',
        });
      },
    };
  }

  return {
    create() {
      return new InMemoryStepController();
    },
  };
};
