import type { EnvProfile, WebStepDraft, WebStepPlanDraft } from '@aiwtp/web-dsl-schema';
import type {
  ControlPlaneTemplateFieldRecord,
  ControlPlaneTemplateSchemaRecord,
} from '../types.js';

type DatasetValueType = ControlPlaneTemplateFieldRecord['valueType'];

export class ControlPlaneRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ControlPlaneRequestError';
  }
}

const inferValueType = (value: unknown, fallback: DatasetValueType): DatasetValueType => {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  switch (typeof value) {
    case 'string':
      return fallback === 'file' ? 'file' : 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'object':
      return 'object';
    default:
      return fallback;
  }
};

const mergeField = (
  target: Map<string, ControlPlaneTemplateFieldRecord>,
  key: string,
  next: ControlPlaneTemplateFieldRecord,
): void => {
  const existing = target.get(key);
  if (!existing) {
    target.set(key, next);
    return;
  }

  const valueType = existing.valueType === 'unknown' ? next.valueType : existing.valueType;
  const sourceType = existing.sourceType === 'variable_ref' && next.sourceType !== 'variable_ref'
    ? next.sourceType
    : existing.sourceType;

  target.set(key, {
    ...existing,
    sourceType,
    valueType,
    required: existing.required || next.required,
  });
};

const walkSteps = (
  steps: WebStepDraft[],
  sampleValues: Record<string, unknown>,
  target: Map<string, ControlPlaneTemplateFieldRecord>,
): void => {
  for (const step of steps) {
    if (step.input?.source === 'variable_ref' && step.input.ref) {
      mergeField(target, step.input.ref, {
        key: step.input.ref,
        sourceType: 'variable_ref',
        valueType: inferValueType(sampleValues[step.input.ref], 'string'),
        required: true,
      });
    }

    if (step.input?.source === 'file_ref' && step.input.ref) {
      mergeField(target, step.input.ref, {
        key: step.input.ref,
        sourceType: 'file_ref',
        valueType: inferValueType(sampleValues[step.input.ref], 'file'),
        required: true,
      });
    }

    if (step.loopSourceRef) {
      mergeField(target, step.loopSourceRef, {
        key: step.loopSourceRef,
        sourceType: 'loop_source_ref',
        valueType: inferValueType(sampleValues[step.loopSourceRef], 'array'),
        required: true,
      });
    }

    if (step.children?.length) {
      walkSteps(step.children, sampleValues, target);
    }
  }
};

export const deriveTemplateSchemaFromPlan = (
  plan: WebStepPlanDraft,
  sampleValues: Record<string, unknown> = {},
): ControlPlaneTemplateSchemaRecord => {
  const fields = new Map<string, ControlPlaneTemplateFieldRecord>();
  walkSteps(plan.steps, sampleValues, fields);
  return {
    fields: [...fields.values()].sort((left, right) => left.key.localeCompare(right.key)),
  };
};

const assertValueMatchesType = (
  key: string,
  value: unknown,
  valueType: DatasetValueType,
): void => {
  switch (valueType) {
    case 'unknown':
      return;
    case 'string':
      if (typeof value !== 'string') {
        throw new ControlPlaneRequestError(400, 'INVALID_DATASET_VALUES', `dataset field ${key} must be a string`);
      }
      return;
    case 'file':
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new ControlPlaneRequestError(400, 'INVALID_DATASET_VALUES', `dataset field ${key} must be a non-empty file path string`);
      }
      return;
    case 'number':
      if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new ControlPlaneRequestError(400, 'INVALID_DATASET_VALUES', `dataset field ${key} must be a number`);
      }
      return;
    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new ControlPlaneRequestError(400, 'INVALID_DATASET_VALUES', `dataset field ${key} must be a boolean`);
      }
      return;
    case 'array':
      if (!Array.isArray(value)) {
        throw new ControlPlaneRequestError(400, 'INVALID_DATASET_VALUES', `dataset field ${key} must be an array`);
      }
      return;
    case 'object':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new ControlPlaneRequestError(400, 'INVALID_DATASET_VALUES', `dataset field ${key} must be an object`);
      }
      return;
  }
};

export const validateDatasetValues = (
  schema: ControlPlaneTemplateSchemaRecord,
  values: Record<string, unknown> | undefined,
): Record<string, unknown> => {
  const normalized = values ?? {};
  const fieldsByKey = new Map(schema.fields.map((field) => [field.key, field]));

  for (const field of schema.fields) {
    if (field.required && !(field.key in normalized)) {
      throw new ControlPlaneRequestError(400, 'INVALID_DATASET_VALUES', `dataset field ${field.key} is required`);
    }
  }

  for (const [key, value] of Object.entries(normalized)) {
    const field = fieldsByKey.get(key);
    if (!field) {
      throw new ControlPlaneRequestError(400, 'INVALID_DATASET_VALUES', `dataset field ${key} is not declared in the template`);
    }
    assertValueMatchesType(key, value, field.valueType);
  }

  return { ...normalized };
};

export const ensureDefaultDatasetValues = (
  schema: ControlPlaneTemplateSchemaRecord,
  provided: Record<string, unknown> | undefined,
): Record<string, unknown> => {
  if (schema.fields.length === 0) {
    return validateDatasetValues(schema, provided ?? {});
  }
  if (!provided) {
    throw new ControlPlaneRequestError(400, 'DEFAULT_DATASET_REQUIRED', 'default dataset values are required when the case version has template fields');
  }
  return validateDatasetValues(schema, provided);
};

export const buildExecutionInputSnapshot = (
  plan: WebStepPlanDraft,
  envProfile: EnvProfile,
  datasetValues: Record<string, unknown>,
  variableContext?: Record<string, unknown>,
): Record<string, unknown> => ({
  ...(plan.variables ?? {}),
  ...(envProfile.variables ?? {}),
  ...datasetValues,
  ...(variableContext ?? {}),
});
