import { HttpResultPublisher } from './http-publisher.js';
import { NoopResultPublisher } from './noop-publisher.js';
import type { ResultPublisher } from './types.js';

export const createResultPublisherFromEnv = (env: NodeJS.ProcessEnv = process.env): ResultPublisher => {
  const mode = env.WEB_WORKER_RESULT_PUBLISH_MODE ?? 'noop';
  if (mode === 'http') {
    const endpoint = env.WEB_WORKER_RESULT_PUBLISH_ENDPOINT;
    if (!endpoint) {
      throw new Error('WEB_WORKER_RESULT_PUBLISH_ENDPOINT is required when WEB_WORKER_RESULT_PUBLISH_MODE=http');
    }

    return new HttpResultPublisher({
      endpoint,
      timeoutMs: env.WEB_WORKER_RESULT_PUBLISH_TIMEOUT_MS ? Number(env.WEB_WORKER_RESULT_PUBLISH_TIMEOUT_MS) : 5000,
      authToken: env.WEB_WORKER_RESULT_PUBLISH_AUTH_TOKEN,
    });
  }

  return new NoopResultPublisher();
};
