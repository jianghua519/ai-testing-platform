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
    const executor = this.registry.resolve(step);
    return executor.execute(step, session, this);
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

  buildSkippedResults(steps: CompiledStep[], session: ExecutionSession, reason: string): StepResult[] {
    const results: StepResult[] = [];
    for (const step of steps) {
      results.push(buildSkippedStepResult(step, session, reason));
      results.push(...this.buildSkippedResults(step.children, session, reason));
    }
    return results;
  }
}
