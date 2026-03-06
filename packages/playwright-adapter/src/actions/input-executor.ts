import type { CompiledStep } from '@aiwtp/web-dsl-schema';
import type { StepExecutionDriver, StepExecutionOutput, StepExecutor } from '../types.js';
import { buildLocator } from '../locators/locator-factory.js';
import { normalizeError } from '../result/error-normalizer.js';
import { buildStepResult } from '../result/step-result-builder.js';
import { resolveInputValue } from '../runtime/input-value.js';

export class InputStepExecutor implements StepExecutor {
  supports(step: CompiledStep): boolean {
    return step.executeMode === 'single' && step.action === 'input';
  }

  async execute(step: CompiledStep, session: Parameters<StepExecutor['execute']>[1], _driver: StepExecutionDriver): Promise<StepExecutionOutput> {
    const startedAt = session.clock.now();
    try {
      if (!step.locatorResolved) {
        throw new Error('input step requires locatorResolved');
      }
      await buildLocator(session.page, step.locatorResolved).fill(resolveInputValue(step.inputResolved, session), { timeout: step.timeoutMs });
      const artifacts = await session.artifacts.collectForStep(step.sourceStepId);
      const finishedAt = session.clock.now();
      return {
        stepResult: buildStepResult({ step, session, startedAt, finishedAt, status: 'passed', artifacts }),
        childResults: [],
      };
    } catch (error) {
      const normalized = normalizeError(error);
      const finishedAt = session.clock.now();
      return {
        stepResult: buildStepResult({ step, session, startedAt, finishedAt, status: 'failed', errorCode: normalized.code, errorMessage: normalized.message }),
        childResults: [],
      };
    }
  }
}
