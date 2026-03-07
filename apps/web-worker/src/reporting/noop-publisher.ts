import type { ResultPublisher } from './types.js';
import type { JobMetadata, WebWorkerResult } from '../job-runner/types.js';
import type { StepResult } from '@aiwtp/web-dsl-schema';

export class NoopResultPublisher implements ResultPublisher {
  readonly published: WebWorkerResult[] = [];
  readonly publishedSteps: Array<{ metadata: JobMetadata; stepResult: StepResult }> = [];

  async publish(result: WebWorkerResult): Promise<void> {
    this.published.push(result);
  }

  async publishStep(metadata: JobMetadata, stepResult: StepResult): Promise<void> {
    this.publishedSteps.push({ metadata, stepResult });
  }
}
