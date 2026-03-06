import type { ResultPublisher } from './types.js';
import type { WebWorkerResult } from '../job-runner/types.js';

export class NoopResultPublisher implements ResultPublisher {
  readonly published: WebWorkerResult[] = [];

  async publish(result: WebWorkerResult): Promise<void> {
    this.published.push(result);
  }
}
