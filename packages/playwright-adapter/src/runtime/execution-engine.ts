import type { CompiledAssertion, CompiledStep, CompiledWebPlan, StepResult } from '@aiwtp/web-dsl-schema';
import { runAssertions } from '../assertions/assertion-executor.js';
import { buildPlanResult } from '../result/plan-result-builder.js';
import { buildCanceledStepResult, buildSkippedStepResult } from '../result/step-result-builder.js';
import type { ExecutionSession, PlanExecutionOutput, StepExecutionDriver, StepExecutionOutput, StepExecutorRegistry } from '../types.js';

export class ExecutionEngine implements StepExecutionDriver {
  constructor(private readonly registry: StepExecutorRegistry) {}

  async executePlan(plan: CompiledWebPlan, session: ExecutionSession): Promise<PlanExecutionOutput> {
    const startedAt = session.clock.now();
    const stepResults = await this.executeChildren(plan.compiledSteps, session);
    const finishedAt = session.clock.now();
    let artifacts: StepResult['artifacts'] = [];
    try {
      artifacts = await session.artifacts.finalizePlan(plan, buildPlanResult(plan, stepResults, startedAt, finishedAt), session);
    } catch {
      artifacts = [];
    }
    return {
      planResult: buildPlanResult(plan, stepResults, startedAt, finishedAt, artifacts),
    };
  }

  async executeStep(step: CompiledStep, session: ExecutionSession): Promise<StepExecutionOutput> {
    const decision = session.controller ? await session.controller.beforeStep(step, session) : { action: 'execute' as const };
    const effectiveStep = decision.replacementStep ?? step;

    if (decision.action === 'cancel') {
      const canceled = await this.attachArtifacts(
        effectiveStep,
        buildCanceledStepResult(effectiveStep, session, decision.reason ?? 'step canceled by controller'),
        session,
      );
      await session.observer?.onStepCompleted?.(canceled, session);
      return {
        stepResult: canceled,
        childResults: [],
        haltPlan: 'canceled',
      };
    }

    if (decision.action === 'skip') {
      const skipped = await this.attachArtifacts(
        effectiveStep,
        buildSkippedStepResult(effectiveStep, session, decision.reason ?? 'step skipped by controller'),
        session,
      );
      await session.observer?.onStepCompleted?.(skipped, session);
      return {
        stepResult: skipped,
        childResults: [],
      };
    }

    try {
      await session.artifacts.beforeStep(effectiveStep, session);
    } catch {
      // Artifact preparation is best-effort.
    }
    await session.observer?.onStepStarted?.(effectiveStep, session);
    const executor = this.registry.resolve(effectiveStep);
    const output = await executor.execute(effectiveStep, session, this);
    const stepResult = await this.attachArtifacts(effectiveStep, output.stepResult, session);
    await session.observer?.onStepCompleted?.(stepResult, session);
    return {
      ...output,
      stepResult,
    };
  }

  async executeChildren(steps: CompiledStep[], session: ExecutionSession): Promise<StepResult[]> {
    const results: StepResult[] = [];
    for (const [index, step] of steps.entries()) {
      const output = await this.executeStep(step, session);
      results.push(output.stepResult, ...output.childResults);
      if (output.haltPlan === 'canceled') {
        results.push(...(await this.buildSkippedResults(steps.slice(index + 1), session, 'step execution halted after cancellation')));
        break;
      }
    }
    return results;
  }

  async evaluateAssertions(assertions: CompiledAssertion[], session: ExecutionSession, timeoutMs: number): Promise<void> {
    await runAssertions(session.page, assertions, timeoutMs);
  }

  async buildSkippedResults(steps: CompiledStep[], session: ExecutionSession, reason: string): Promise<StepResult[]> {
    const results: StepResult[] = [];
    for (const step of steps) {
      const result = await this.attachArtifacts(step, buildSkippedStepResult(step, session, reason), session);
      results.push(result);
      await session.observer?.onStepCompleted?.(result, session);
      results.push(...(await this.buildSkippedResults(step.children, session, reason)));
    }
    return results;
  }

  private async attachArtifacts(step: CompiledStep, stepResult: StepResult, session: ExecutionSession): Promise<StepResult> {
    let artifacts: StepResult['artifacts'] = [];
    try {
      artifacts = await session.artifacts.collectForStep(step, stepResult, session);
    } catch {
      artifacts = [];
    }

    if (artifacts.length === 0) {
      return stepResult;
    }

    return {
      ...stepResult,
      artifacts: [...stepResult.artifacts, ...artifacts],
    };
  }
}
