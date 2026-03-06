import type { HttpResultPublisherConfig, ResultEnvelopeFactory, ResultPublisher } from './types.js';
import type { WebWorkerResult } from '../job-runner/types.js';
import { DefaultResultEnvelopeFactory } from './result-envelope.js';

export class HttpResultPublisher implements ResultPublisher {
  constructor(
    private readonly config: HttpResultPublisherConfig,
    private readonly envelopeFactory: ResultEnvelopeFactory = new DefaultResultEnvelopeFactory(),
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async publish(result: WebWorkerResult): Promise<void> {
    const envelope = this.envelopeFactory.build(result);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 5000);

    try {
      const response = await this.fetchImpl(this.config.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.config.authToken ? { authorization: `Bearer ${this.config.authToken}` } : {}),
          ...(this.config.additionalHeaders ?? {}),
        },
        body: JSON.stringify(envelope),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`result publish failed: ${response.status} ${response.statusText}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
