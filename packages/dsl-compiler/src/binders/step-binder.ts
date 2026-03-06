import type {
  CompiledAssertion,
  CompiledStep,
  ResolvedInput,
  RuntimeHook,
} from '@aiwtp/web-dsl-schema';
import type { CompileContext, NormalizedStep } from '../types.js';
import { resolveLocator } from '../resolvers/locator-resolver.js';

const toExecuteMode = (step: NormalizedStep): CompiledStep['executeMode'] => {
  switch (step.action) {
    case 'if':
      return 'branch';
    case 'foreach':
      return 'loop';
    case 'group':
      return 'group';
    default:
      return 'single';
  }
};

const toResolvedInput = (step: NormalizedStep): ResolvedInput | undefined => {
  if (!step.input) {
    return undefined;
  }

  switch (step.input.source) {
    case 'literal':
      return { source: 'literal', value: step.input.value, isRuntimeBound: false };
    case 'variable_ref':
      return { source: 'variable', ref: step.input.ref, isRuntimeBound: true };
    case 'secret_ref':
      return { source: 'secret', ref: step.input.ref, isRuntimeBound: true };
    case 'file_ref':
      return { source: 'file', ref: step.input.ref, isRuntimeBound: true };
  }
};

const toCompiledAssertions = (context: CompileContext, step: NormalizedStep): CompiledAssertion[] =>
  (step.assertions ?? []).map((assertion) => ({
    operator: assertion.operator,
    expected: assertion.expected,
    attrName: assertion.attrName,
    locator: resolveLocator(assertion.locator, context),
  }));

const toRuntimeHooks = (step: NormalizedStep): RuntimeHook[] =>
  (step.hooks ?? []).map((hook) => ({
    hookType: hook.hookType,
    action: hook.action,
    enabled: hook.enabled,
  }));

export const bindStep = (context: CompileContext, step: NormalizedStep): CompiledStep => ({
  compiledStepId: `compiled-${step.stepId}`,
  sourceStepId: step.stepId,
  name: step.name,
  kind: step.kind,
  action: step.action,
  executeMode: toExecuteMode(step),
  locatorResolved: resolveLocator(step.locator, context),
  inputResolved: toResolvedInput(step),
  expectations: toCompiledAssertions(context, step),
  timeoutMs: step.timeoutMs,
  retryPolicy: step.retryPolicy,
  artifactPolicy: step.artifactPolicy,
  runtimeHooks: toRuntimeHooks(step),
  branchCondition: step.branchCondition?.map((assertion) => ({
    operator: assertion.operator,
    expected: assertion.expected,
    attrName: assertion.attrName,
    locator: resolveLocator(assertion.locator, context),
  })),
  loopSource: step.loopSourceRef ? { ref: step.loopSourceRef } : undefined,
  iterationAlias: step.iterationAlias,
  children: step.children.map((child) => bindStep(context, child)),
});
