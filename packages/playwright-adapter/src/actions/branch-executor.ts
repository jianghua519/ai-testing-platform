import type { CompiledStep } from '@aiwtp/web-dsl-schema';
import type { StepExecutionDriver, StepExecutionOutput, StepExecutor } from '../types.js';
import { normalizeError } from '../result/error-normalizer.js';
import { buildStepResult } from '../result/step-result-builder.js';

export class BranchStepExecutor implements StepExecutor {
  supports(step: CompiledStep): boolean {
    return step.executeMode === 'branch';
  }

  async execute(step: CompiledStep, session: Parameters<StepExecutor['execute']>[1], driver: StepExecutionDriver): Promise<StepExecutionOutput> {
    const startedAt = session.clock.now();
    try {
      await driver.evaluateAssertions(step.branchCondition ?? [], session, step.timeoutMs);
      const childResults = await driver.executeChildren(step.children, session);
      const finishedAt = session.clock.now();
      return {
        stepResult: buildStepResult({ step, session, startedAt, finishedAt, status: 'passed' }),
        childResults,
      };
    } catch (error) {
      const normalized = normalizeError(error);
      const finishedAt = session.clock.now();
      return {
        stepResult: buildStepResult({ step, session, startedAt, finishedAt, status: 'skipped', errorCode: normalized.code, errorMessage: normalized.message, attempts: 0 }),
        childResults: await driver.buildSkippedResults(step.children, session, 'branch condition not satisfied'),
      };
    }
  }
}
