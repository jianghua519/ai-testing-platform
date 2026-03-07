import type { CompiledStep } from '@aiwtp/web-dsl-schema';
import type { ExecutionSession, StepControlDecision, StepExecutionController } from '../types.js';

export class InMemoryStepController implements StepExecutionController {
  private paused = false;
  private resumeWaiters: Array<() => void> = [];
  private readonly replacements = new Map<string, CompiledStep>();
  private readonly skips = new Map<string, string>();

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    for (const waiter of this.resumeWaiters.splice(0)) {
      waiter();
    }
  }

  replaceNextStep(stepId: string, replacementStep: CompiledStep): void {
    this.replacements.set(stepId, replacementStep);
  }

  skipNextStep(stepId: string, reason = 'step skipped by controller'): void {
    this.skips.set(stepId, reason);
  }

  async beforeStep(step: CompiledStep, _session: ExecutionSession): Promise<StepControlDecision> {
    await this.waitIfPaused();

    if (this.skips.has(step.sourceStepId)) {
      const reason = this.skips.get(step.sourceStepId) ?? 'step skipped by controller';
      this.skips.delete(step.sourceStepId);
      return {
        action: 'skip',
        reason,
      };
    }

    if (this.replacements.has(step.sourceStepId)) {
      const replacementStep = this.replacements.get(step.sourceStepId);
      this.replacements.delete(step.sourceStepId);
      return {
        action: 'execute',
        replacementStep,
      };
    }

    return {
      action: 'execute',
    };
  }

  private async waitIfPaused(): Promise<void> {
    if (!this.paused) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.resumeWaiters.push(resolve);
    });
  }
}
