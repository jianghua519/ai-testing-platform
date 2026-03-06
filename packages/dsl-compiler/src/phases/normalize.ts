import type { ArtifactPolicy, RetryPolicy, WebStepDraft } from '@aiwtp/web-dsl-schema';
import type { CompileContext, NormalizedPlan, NormalizedStep } from '../types.js';

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 1,
  intervalMs: 0,
  backoff: 'fixed',
};

const DEFAULT_ARTIFACT_POLICY: ArtifactPolicy = {
  screenshot: 'on_failure',
  trace: 'on_failure',
  video: 'none',
  domSnapshot: false,
  networkCapture: false,
};

const DEFAULT_TIMEOUT_MS = 10_000;

const normalizeStep = (step: WebStepDraft, planDefaults: NormalizedPlan['defaults']): NormalizedStep => ({
  ...step,
  kind: step.kind.toLowerCase() as NormalizedStep['kind'],
  action: step.action.toLowerCase() as NormalizedStep['action'],
  locator: step.locator
    ? {
        ...step.locator,
        value: step.locator.value.trim(),
      }
    : undefined,
  timeoutMs: step.timeoutMs ?? planDefaults.timeoutMs,
  retryPolicy: {
    ...planDefaults.retryPolicy,
    ...(step.retryPolicy ?? {}),
  },
  artifactPolicy: {
    ...planDefaults.artifactPolicy,
    ...(step.artifactPolicy ?? {}),
  },
  children: (step.children ?? []).map((child) => normalizeStep(child, planDefaults)),
});

export const normalize = (context: CompileContext): void => {
  const defaults: NormalizedPlan['defaults'] = {
    timeoutMs: context.sourcePlan.defaults?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retryPolicy: context.sourcePlan.defaults?.retryPolicy ?? DEFAULT_RETRY_POLICY,
    artifactPolicy: context.sourcePlan.defaults?.artifactPolicy ?? DEFAULT_ARTIFACT_POLICY,
  };

  context.normalizedPlan = {
    ...context.sourcePlan,
    browserProfile: {
      ...context.sourcePlan.browserProfile,
      browser: context.sourcePlan.browserProfile.browser.toLowerCase() as NormalizedPlan['browserProfile']['browser'],
    },
    defaults,
    steps: context.sourcePlan.steps.map((step) => normalizeStep(step, defaults)),
  };
};
