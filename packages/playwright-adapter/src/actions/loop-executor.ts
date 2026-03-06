import type { CompiledStep } from '@aiwtp/web-dsl-schema';
import type { StepExecutionDriver, StepExecutionOutput, StepExecutor } from '../types.js';
import { buildStepResult } from '../result/step-result-builder.js';

export class LoopStepExecutor implements StepExecutor {
  supports(step: CompiledStep): boolean {
    return step.executeMode === 'loop';
  }

  async execute(step: CompiledStep, session: Parameters<StepExecutor['execute']>[1], driver: StepExecutionDriver): Promise<StepExecutionOutput> {
    const startedAt = session.clock.now();
    const loopValues = session.variables.resolve(step.loopSource?.ref);
    const childResults = Array.isArray(loopValues)
      ? (await Promise.all(
          loopValues.map(async (value, index) => {
            if (step.iterationAlias) {
              session.variables.set(step.iterationAlias, value);
            }
            session.variables.set(`${step.sourceStepId}.index`, index);
            return driver.executeChildren(step.children, session);
          }),
        )).flat()
      : [];
    const finishedAt = session.clock.now();
    return {
      stepResult: buildStepResult({ step, session, startedAt, finishedAt, status: 'passed' }),
      childResults,
    };
  }
}
