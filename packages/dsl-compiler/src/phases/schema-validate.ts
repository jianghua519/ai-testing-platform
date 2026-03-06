import { COMPILE_ISSUE_CODES, type CompileIssue, type WebStepDraft } from '@aiwtp/web-dsl-schema';
import type { CompileContext } from '../types.js';

const pushIssue = (context: CompileContext, issue: CompileIssue): void => {
  context.diagnostics.add(issue);
};

const validateStep = (context: CompileContext, step: WebStepDraft, seen: Set<string>): void => {
  if (!step.kind) {
    pushIssue(context, {
      code: COMPILE_ISSUE_CODES.schemaMissingStepKind,
      severity: 'error',
      message: 'step.kind 不能为空',
      stepId: step.stepId,
      fieldPath: 'steps[].kind',
    });
  }

  if (!step.action) {
    pushIssue(context, {
      code: COMPILE_ISSUE_CODES.schemaMissingStepAction,
      severity: 'error',
      message: 'step.action 不能为空',
      stepId: step.stepId,
      fieldPath: 'steps[].action',
    });
  }

  if (seen.has(step.stepId)) {
    pushIssue(context, {
      code: COMPILE_ISSUE_CODES.schemaDuplicateStepId,
      severity: 'error',
      message: `step_id 重复: ${step.stepId}`,
      stepId: step.stepId,
      fieldPath: 'steps[].stepId',
    });
  }
  seen.add(step.stepId);

  if (step.action === 'foreach' && !step.loopSourceRef) {
    pushIssue(context, {
      code: COMPILE_ISSUE_CODES.referenceMissingLoopSource,
      severity: 'error',
      message: 'foreach step 必须配置 loopSourceRef',
      stepId: step.stepId,
      fieldPath: 'steps[].loopSourceRef',
    });
  }

  for (const child of step.children ?? []) {
    validateStep(context, child, seen);
  }
};

export const schemaValidate = (context: CompileContext): void => {
  const { sourcePlan } = context;
  if (!sourcePlan.planId.trim()) {
    pushIssue(context, {
      code: COMPILE_ISSUE_CODES.schemaMissingPlanId,
      severity: 'error',
      message: 'planId 不能为空',
      fieldPath: 'planId',
    });
  }

  if (!sourcePlan.planName.trim()) {
    pushIssue(context, {
      code: COMPILE_ISSUE_CODES.schemaMissingPlanName,
      severity: 'error',
      message: 'planName 不能为空',
      fieldPath: 'planName',
    });
  }

  if (sourcePlan.browserProfile.viewport.width <= 0 || sourcePlan.browserProfile.viewport.height <= 0) {
    pushIssue(context, {
      code: COMPILE_ISSUE_CODES.schemaInvalidViewport,
      severity: 'error',
      message: 'viewport 宽高必须大于 0',
      fieldPath: 'browserProfile.viewport',
    });
  }

  const seen = new Set<string>();
  for (const step of sourcePlan.steps) {
    validateStep(context, step, seen);
  }
};
