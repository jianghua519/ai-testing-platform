import type { CompiledStep, CompiledWebPlan } from '@aiwtp/web-dsl-schema';
import { AssertStepExecutor } from '../actions/assert-executor.js';
import { BranchStepExecutor } from '../actions/branch-executor.js';
import { ClickStepExecutor } from '../actions/click-executor.js';
import { ExtractStepExecutor } from '../actions/extract-executor.js';
import { GroupStepExecutor } from '../actions/group-executor.js';
import { InputStepExecutor } from '../actions/input-executor.js';
import { LoopStepExecutor } from '../actions/loop-executor.js';
import { OpenStepExecutor } from '../actions/open-executor.js';
import { UploadStepExecutor } from '../actions/upload-executor.js';
import { WaitStepExecutor } from '../actions/wait-executor.js';
import { ExecutionEngine } from './execution-engine.js';
import { BasicStepExecutorRegistry } from './registry.js';
import type { ExecutionSession, PlanExecutionOutput, PlaywrightAdapter, StepExecutionOutput, StepExecutorRegistry } from '../types.js';

const createDefaultRegistry = (): StepExecutorRegistry => {
  const registry = new BasicStepExecutorRegistry();
  registry.register(new BranchStepExecutor());
  registry.register(new LoopStepExecutor());
  registry.register(new GroupStepExecutor());
  registry.register(new OpenStepExecutor());
  registry.register(new ClickStepExecutor());
  registry.register(new InputStepExecutor());
  registry.register(new UploadStepExecutor());
  registry.register(new WaitStepExecutor());
  registry.register(new AssertStepExecutor());
  registry.register(new ExtractStepExecutor());
  return registry;
};

export class RegistryBasedPlaywrightAdapter implements PlaywrightAdapter {
  private readonly engine: ExecutionEngine;

  constructor(private readonly registry: StepExecutorRegistry = createDefaultRegistry()) {
    this.engine = new ExecutionEngine(registry);
  }

  async executePlan(plan: CompiledWebPlan, session: ExecutionSession): Promise<PlanExecutionOutput> {
    return this.engine.executePlan(plan, session);
  }

  async executeStep(step: CompiledStep, session: ExecutionSession): Promise<StepExecutionOutput> {
    return this.engine.executeStep(step, session);
  }
}
