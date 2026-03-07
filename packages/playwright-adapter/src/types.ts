import type {
  ArtifactReference,
  CompiledAssertion,
  CompiledStep,
  CompiledWebPlan,
  ExtractedVariable,
  PlanExecutionResult,
  StepResult,
} from '@aiwtp/web-dsl-schema';
import type { Browser, BrowserContext, Page } from 'playwright-core';

export interface RuntimeVariableStore {
  get(name: string): unknown;
  set(name: string, value: unknown): void;
  snapshot(): Record<string, unknown>;
  resolve(ref?: string): unknown;
}

export interface ArtifactCollector {
  collectForStep(stepId: string): Promise<ArtifactReference[]>;
}

export interface ExecutionClock {
  now(): Date;
}

export interface StepControlDecision {
  action: 'execute' | 'skip';
  replacementStep?: CompiledStep;
  reason?: string;
}

export interface StepExecutionController {
  beforeStep(step: CompiledStep, session: ExecutionSession): Promise<StepControlDecision>;
}

export interface StepLifecycleObserver {
  onStepStarted?(step: CompiledStep, session: ExecutionSession): Promise<void>;
  onStepCompleted?(stepResult: StepResult, session: ExecutionSession): Promise<void>;
}

export interface ExecutionSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  variables: RuntimeVariableStore;
  artifacts: ArtifactCollector;
  clock: ExecutionClock;
  controller?: StepExecutionController;
  observer?: StepLifecycleObserver;
}

export interface StepExecutionOutput {
  stepResult: StepResult;
  childResults: StepResult[];
}

export interface PlanExecutionOutput {
  planResult: PlanExecutionResult;
}

export interface StepExecutionDriver {
  executeChildren(steps: CompiledStep[], session: ExecutionSession): Promise<StepResult[]>;
  evaluateAssertions(assertions: CompiledAssertion[], session: ExecutionSession, timeoutMs: number): Promise<void>;
  buildSkippedResults(steps: CompiledStep[], session: ExecutionSession, reason: string): Promise<StepResult[]>;
}

export interface StepExecutor {
  supports(step: CompiledStep): boolean;
  execute(step: CompiledStep, session: ExecutionSession, driver: StepExecutionDriver): Promise<StepExecutionOutput>;
}

export interface StepExecutorRegistry {
  register(executor: StepExecutor): void;
  resolve(step: CompiledStep): StepExecutor;
}

export interface PlaywrightAdapter {
  executePlan(plan: CompiledWebPlan, session: ExecutionSession): Promise<PlanExecutionOutput>;
  executeStep(step: CompiledStep, session: ExecutionSession): Promise<StepExecutionOutput>;
}
