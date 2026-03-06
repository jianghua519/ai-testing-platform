export type BrowserKind = 'chromium' | 'firefox' | 'webkit';
export type BackoffMode = 'fixed' | 'linear' | 'exponential';
export type ArtifactCaptureMode = 'always' | 'on_failure' | 'none';
export type LocatorStrategy = 'role' | 'text' | 'label' | 'placeholder' | 'test_id' | 'css' | 'xpath';
export type WebAction =
  | 'open'
  | 'click'
  | 'input'
  | 'select'
  | 'wait'
  | 'hover'
  | 'upload'
  | 'press'
  | 'assert'
  | 'extract'
  | 'if'
  | 'foreach'
  | 'group';
export type StepKind = 'navigation' | 'interaction' | 'assertion' | 'extraction' | 'control';
export type AssertionOperator =
  | 'visible'
  | 'hidden'
  | 'text_equals'
  | 'text_contains'
  | 'value_equals'
  | 'url_contains'
  | 'attr_equals';
export type InputSourceType = 'literal' | 'variable_ref' | 'secret_ref' | 'file_ref';

export interface ViewportSize {
  width: number;
  height: number;
}

export interface RetryPolicy {
  maxAttempts: number;
  intervalMs: number;
  backoff: BackoffMode;
}

export interface ArtifactPolicy {
  screenshot: ArtifactCaptureMode;
  trace: ArtifactCaptureMode;
  video: ArtifactCaptureMode;
  domSnapshot: boolean;
  networkCapture: boolean;
}

export interface BrowserProfile {
  browser: BrowserKind;
  headless: boolean;
  viewport: ViewportSize;
  storageStateRef?: string;
}

export interface EnvProfile {
  profileId: string;
  baseUrl?: string;
  browserProfile: BrowserProfile;
  variables?: Record<string, unknown>;
}

export interface DatasetRecord {
  recordId: string;
  values: Record<string, unknown>;
}

export interface LocatorOptions {
  exact?: boolean;
  roleName?: string;
  nth?: number;
  framePath?: string[];
}

export interface LocatorDraft {
  strategy: LocatorStrategy;
  value: string;
  options?: LocatorOptions;
}

export interface StepInputDraft {
  source: InputSourceType;
  value?: string;
  ref?: string;
}

export interface AssertionDraft {
  operator: AssertionOperator;
  expected?: string;
  attrName?: string;
  locator?: LocatorDraft;
}

export interface RuntimeHookDraft {
  hookType: 'before_step' | 'after_step' | 'on_error';
  action: 'log' | 'capture_snapshot' | 'emit_variable';
  enabled: boolean;
}

export interface WebStepDraft {
  stepId: string;
  name: string;
  kind: StepKind;
  action: WebAction;
  locator?: LocatorDraft;
  input?: StepInputDraft;
  assertions?: AssertionDraft[];
  hooks?: RuntimeHookDraft[];
  retryPolicy?: Partial<RetryPolicy>;
  artifactPolicy?: Partial<ArtifactPolicy>;
  timeoutMs?: number;
  branchCondition?: AssertionDraft[];
  loopSourceRef?: string;
  iterationAlias?: string;
  children?: WebStepDraft[];
}

export interface WebStepPlanDefaults {
  timeoutMs?: number;
  retryPolicy?: RetryPolicy;
  artifactPolicy?: ArtifactPolicy;
}

export interface WebStepPlanDraft {
  planId: string;
  planName: string;
  version: string;
  browserProfile: BrowserProfile;
  defaults?: WebStepPlanDefaults;
  variables?: Record<string, unknown>;
  steps: WebStepDraft[];
}
