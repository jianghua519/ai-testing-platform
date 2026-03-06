import type { WebWorkerResult } from '../job-runner/types.js';

export interface ResultPublisher {
  publish(result: WebWorkerResult): Promise<void>;
}
