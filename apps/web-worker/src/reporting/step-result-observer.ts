import type { StepLifecycleObserver } from '@aiwtp/playwright-adapter';
import type { JobMetadata } from '../job-runner/types.js';
import type { ResultPublisher } from './types.js';

export class PublishingStepObserver implements StepLifecycleObserver {
  constructor(
    private readonly metadata: JobMetadata,
    private readonly publisher: ResultPublisher,
  ) {}

  async onStepCompleted(stepResult: import('@aiwtp/web-dsl-schema').StepResult): Promise<void> {
    await this.publisher.publishStep(this.metadata, stepResult);
  }
}
