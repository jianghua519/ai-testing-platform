import type { CompiledStep } from '@aiwtp/web-dsl-schema';
import type { StepExecutionDriver, StepExecutionOutput, StepExecutor } from '../types.js';
import { extractForStep } from '../extractors/basic-extractor.js';
import { normalizeError } from '../result/error-normalizer.js';
import { buildStepResult } from '../result/step-result-builder.js';

export class ExtractStepExecutor implements StepExecutor {
  supports(step: CompiledStep): boolean {
    return step.executeMode === 'single' && step.action === 'extract';
  }

  async execute(step: CompiledStep, session: Parameters<StepExecutor['execute']>[1], _driver: StepExecutionDriver): Promise<StepExecutionOutput> {
    const startedAt = session.clock.now();
    try {
      const extractedVariables = await extractForStep(session.page, step);
      for (const variable of extractedVariables) {
        session.variables.set(variable.name, variable.value);
      }
      const artifacts = await session.artifacts.collectForStep(step.sourceStepId);
      const finishedAt = session.clock.now();
      return {
        stepResult: buildStepResult({ step, session, startedAt, finishedAt, status: 'passed', artifacts, extractedVariables }),
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
