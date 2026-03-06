import type { CompiledStep } from '@aiwtp/web-dsl-schema';
import type { StepExecutionDriver, StepExecutionOutput, StepExecutor } from '../types.js';
import { normalizeError } from '../result/error-normalizer.js';
import { buildStepResult } from '../result/step-result-builder.js';

export class AssertStepExecutor implements StepExecutor {
  supports(step: CompiledStep): boolean {
    return step.executeMode === 'single' && step.action === 'assert';
  }

  async execute(step: CompiledStep, session: Parameters<StepExecutor['execute']>[1], driver: StepExecutionDriver): Promise<StepExecutionOutput> {
    const startedAt = session.clock.now();
    try {
      await driver.evaluateAssertions(step.expectations, session, step.timeoutMs);
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
