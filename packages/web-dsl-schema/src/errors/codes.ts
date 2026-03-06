export const COMPILE_ISSUE_CODES = {
  schemaMissingPlanId: 'DSL_SCHEMA_MISSING_PLAN_ID',
  schemaMissingPlanName: 'DSL_SCHEMA_MISSING_PLAN_NAME',
  schemaInvalidViewport: 'DSL_SCHEMA_INVALID_VIEWPORT',
  schemaDuplicateStepId: 'DSL_SCHEMA_DUPLICATE_STEP_ID',
  schemaMissingStepAction: 'DSL_SCHEMA_MISSING_STEP_ACTION',
  schemaMissingStepKind: 'DSL_SCHEMA_MISSING_STEP_KIND',
  referenceMissingLoopSource: 'DSL_REFERENCE_MISSING_LOOP_SOURCE',
} as const;

export type CompileIssueCode = (typeof COMPILE_ISSUE_CODES)[keyof typeof COMPILE_ISSUE_CODES];
