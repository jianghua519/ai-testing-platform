import type { ArtifactReference, CompiledStep, CompiledWebPlan, PlanExecutionResult, StepResult } from '@aiwtp/web-dsl-schema';
import type { ArtifactCollector, ExecutionSession } from '../types.js';

export class NoopArtifactCollector implements ArtifactCollector {
  async beforeStep(_step: CompiledStep, _session: ExecutionSession): Promise<void> {
    // Intentionally empty.
  }

  async collectForStep(_step: CompiledStep, _stepResult: StepResult, _session: ExecutionSession): Promise<ArtifactReference[]> {
    return [];
  }

  async finalizePlan(_plan: CompiledWebPlan, _planResult: PlanExecutionResult, _session: ExecutionSession): Promise<ArtifactReference[]> {
    return [];
  }

  async finalizeAfterContextClose(_plan: CompiledWebPlan, _planResult: PlanExecutionResult, _session: ExecutionSession): Promise<ArtifactReference[]> {
    return [];
  }
}
