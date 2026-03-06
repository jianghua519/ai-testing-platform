import type { CompiledStep } from '@aiwtp/web-dsl-schema';
import type { StepExecutionDriver, StepExecutionOutput, StepExecutor } from '../types.js';
import { buildStepResult } from '../result/step-result-builder.js';

export class GroupStepExecutor implements StepExecutor {
  supports(step: CompiledStep): boolean {
    return step.executeMode === 'group';
  }

  async execute(step: CompiledStep, session: Parameters<StepExecutor['execute']>[1], driver: StepExecutionDriver): Promise<StepExecutionOutput> {
    const startedAt = session.clock.now();
    const childResults = await driver.executeChildren(step.children, session);
    const finishedAt = session.clock.now();
    return {
      stepResult: buildStepResult({ step, session, startedAt, finishedAt, status: 'passed' }),
      childResults,
    };
  }
}
