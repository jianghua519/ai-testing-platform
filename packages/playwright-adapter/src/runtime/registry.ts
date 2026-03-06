import type { CompiledStep } from '@aiwtp/web-dsl-schema';
import type { StepExecutor, StepExecutorRegistry } from '../types.js';

export class BasicStepExecutorRegistry implements StepExecutorRegistry {
  private readonly executors: StepExecutor[] = [];

  register(executor: StepExecutor): void {
    this.executors.push(executor);
  }

  resolve(step: CompiledStep): StepExecutor {
    const executor = this.executors.find((candidate) => candidate.supports(step));
    if (!executor) {
      throw new Error(`No executor registered for step ${step.sourceStepId} (${step.executeMode}/${step.action})`);
    }
    return executor;
  }
}
