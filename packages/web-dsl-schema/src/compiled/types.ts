import type {
  ArtifactPolicy,
  AssertionDraft,
  BrowserProfile,
  LocatorStrategy,
  RetryPolicy,
  RuntimeHookDraft,
  StepKind,
  WebAction,
  WebStepPlanDraft,
} from '../source/types.js';

export type CompileIssueSeverity = 'error' | 'warning';
export type ExecuteMode = 'single' | 'branch' | 'loop' | 'group';
export type StabilityRank = 'preferred' | 'acceptable' | 'fragile';
export type ResolvedInputSource = 'literal' | 'variable' | 'secret' | 'file';

export interface CompileIssue {
  code: string;
  severity: CompileIssueSeverity;
  message: string;
  fieldPath?: string;
  stepId?: string;
}

export interface ResolvedLocator {
  strategy: LocatorStrategy;
  value: string;
  framePath: string[];
  nth?: number;
  stabilityRank: StabilityRank;
}

export interface ResolvedInput {
  source: ResolvedInputSource;
  value?: string;
  ref?: string;
  isRuntimeBound: boolean;
}

export interface CompiledAssertion {
  operator: AssertionDraft['operator'];
  expected?: string;
  attrName?: string;
  locator?: ResolvedLocator;
}

export interface RuntimeHook {
  hookType: RuntimeHookDraft['hookType'];
  action: RuntimeHookDraft['action'];
  enabled: boolean;
}

export interface RuntimeValuePointer {
  ref: string;
}

export interface CompiledStep {
  compiledStepId: string;
  sourceStepId: string;
  name: string;
  kind: StepKind;
  action: WebAction;
  executeMode: ExecuteMode;
  locatorResolved?: ResolvedLocator;
  inputResolved?: ResolvedInput;
  expectations: CompiledAssertion[];
  timeoutMs: number;
  retryPolicy: RetryPolicy;
  artifactPolicy: ArtifactPolicy;
  runtimeHooks: RuntimeHook[];
  branchCondition?: CompiledAssertion[];
  loopSource?: RuntimeValuePointer;
  iterationAlias?: string;
  children: CompiledStep[];
}

export interface CompileDigest {
  sourcePlanId: string;
  sourceVersion: string;
  compilerVersion: string;
  compiledAt: string;
  normalizedStepCount: number;
  warningCount: number;
}

export interface CompiledWebPlan {
  compiledPlanId: string;
  sourcePlanId: WebStepPlanDraft['planId'];
  sourceVersion: WebStepPlanDraft['version'];
  browserProfile: BrowserProfile;
  runtimeVariables: Record<string, unknown>;
  compiledSteps: CompiledStep[];
  compileDigest: CompileDigest;
}
