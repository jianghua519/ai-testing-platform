import type { CompiledAssertion, CompiledStep, CompiledWebPlan, StepResult } from '@aiwtp/web-dsl-schema';
import { runAssertions } from '../assertions/assertion-executor.js';
import { buildPlanResult } from '../result/plan-result-builder.js';
import { buildSkippedStepResult } from '../result/step-result-builder.js';
import type { ExecutionSession, PlanExecutionOutput, StepExecutionDriver, StepExecutionOutput, StepExecutorRegistry } from '../types.js';

export class ExecutionEngine implements StepExecutionDriver {
  constructor(private readonly registry: StepExecutorRegistry) {}

  async executePlan(plan: CompiledWebPlan, session: ExecutionSession): Promise<PlanExecutionOutput> {
    const startedAt = session.clock.now();
    const stepResults = await this.executeChildren(plan.compiledSteps, session);
    const finishedAt = session.clock.now();
    return {
      planResult: buildPlanResult(plan, stepResults, startedAt, finishedAt),
    };
  }

  async executeStep(step: CompiledStep, session: ExecutionSession): Promise<StepExecutionOutput> {
    const decision = session.controller ? await session.controller.beforeStep(step, session) : { action: 'execute' as const };
    const effectiveStep = decision.replacementStep ?? step;

    if (decision.action === 'skip') {
      const skipped = buildSkippedStepResult(effectiveStep, session, decision.reason ?? 'step skipped by controller');
      await session.observer?.onStepCompleted?.(skipped, session);
      return {
        stepResult: skipped,
        childResults: [],
      };
    }

    await session.observer?.onStepStarted?.(effectiveStep, session);
    const executor = this.registry.resolve(effectiveStep);
    const output = await executor.execute(effectiveStep, session, this);
    await session.observer?.onStepCompleted?.(output.stepResult, session);
    return output;
  }

  async executeChildren(steps: CompiledStep[], session: ExecutionSession): Promise<StepResult[]> {
    const results: StepResult[] = [];
    for (const step of steps) {
      const output = await this.executeStep(step, session);
      results.push(output.stepResult, ...output.childResults);
    }
    return results;
  }

  async evaluateAssertions(assertions: CompiledAssertion[], session: ExecutionSession, timeoutMs: number): Promise<void> {
    await runAssertions(session.page, assertions, timeoutMs);
  }

  async buildSkippedResults(steps: CompiledStep[], session: ExecutionSession, reason: string): Promise<StepResult[]> {
    const results: StepResult[] = [];
    for (const step of steps) {
      const result = buildSkippedStepResult(step, session, reason);
      results.push(result);
      await session.observer?.onStepCompleted?.(result, session);
      results.push(...(await this.buildSkippedResults(step.children, session, reason)));
    }
    return results;
  }
}
