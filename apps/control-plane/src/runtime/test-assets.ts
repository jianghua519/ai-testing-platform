import type { AssertionDraft, AssertionOperator, EnvProfile, LocatorDraft, WebStepDraft, WebStepPlanDraft } from '@aiwtp/web-dsl-schema';
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

export const filterDatasetValuesForSchema = (
  schema: ControlPlaneTemplateSchemaRecord,
  values: Record<string, unknown>,
): Record<string, unknown> => Object.fromEntries(
  schema.fields
    .filter((field) => Object.prototype.hasOwnProperty.call(values, field.key))
    .map((field) => [field.key, values[field.key]]),
);

interface RecordingAnalysisEvent {
  eventType: string;
  pageUrl?: string | null;
  locator?: LocatorDraft | null;
  payload?: Record<string, unknown>;
}

const isLocatorDraft = (value: unknown): value is LocatorDraft =>
  typeof value === 'object'
  && value !== null
  && typeof (value as LocatorDraft).strategy === 'string'
  && typeof (value as LocatorDraft).value === 'string';

const isAssertionOperator = (value: unknown): value is AssertionOperator =>
  value === 'visible'
  || value === 'hidden'
  || value === 'text_equals'
  || value === 'text_contains'
  || value === 'value_equals'
  || value === 'url_contains'
  || value === 'attr_equals';

const resolveEventInput = (
  eventType: string,
  payload: Record<string, unknown>,
): WebStepDraft['input'] | undefined => {
  const explicitSource = typeof payload.source === 'string' ? payload.source : undefined;
  const fallbackRefKey = eventType === 'upload' ? 'file_key' : 'variable_key';
  const fallbackSource = eventType === 'upload' ? 'file_ref' : 'variable_ref';

  if (explicitSource === 'literal' && typeof payload.value === 'string') {
    return { source: 'literal', value: payload.value };
  }
  if ((explicitSource === 'variable_ref' || explicitSource === 'file_ref') && typeof payload.ref === 'string') {
    return { source: explicitSource, ref: payload.ref };
  }
  if (typeof payload[fallbackRefKey] === 'string') {
    return { source: fallbackSource, ref: String(payload[fallbackRefKey]) };
  }
  if (typeof payload.value === 'string') {
    return { source: 'literal', value: payload.value };
  }
  return undefined;
};

const resolveEventAssertions = (
  locator: LocatorDraft | null | undefined,
  payload: Record<string, unknown>,
): AssertionDraft[] => {
  const payloadLocator = isLocatorDraft(payload.locator) ? payload.locator : undefined;
  const assertionLocator = payloadLocator ?? locator ?? undefined;
  const toAssertionDraft = (assertion: Record<string, unknown>): AssertionDraft | null => {
    if (!isAssertionOperator(assertion.operator)) {
      return null;
    }

    return {
      operator: assertion.operator,
      expected: typeof assertion.expected === 'string' ? assertion.expected : undefined,
      attrName: typeof assertion.attrName === 'string'
        ? assertion.attrName
        : typeof assertion.attr_name === 'string'
          ? assertion.attr_name
          : undefined,
      locator: isLocatorDraft(assertion.locator)
        ? assertion.locator
        : assertionLocator,
    };
  };

  if (Array.isArray(payload.assertions)) {
    return payload.assertions
      .filter((assertion): assertion is Record<string, unknown> => typeof assertion === 'object' && assertion !== null)
      .map(toAssertionDraft)
      .filter((assertion): assertion is AssertionDraft => assertion !== null);
  }

  if (!isAssertionOperator(payload.operator)) {
    return [];
  }

  return [{
    operator: payload.operator,
    expected: typeof payload.expected === 'string' ? payload.expected : undefined,
    attrName: typeof payload.attrName === 'string'
      ? payload.attrName
      : typeof payload.attr_name === 'string'
        ? payload.attr_name
        : undefined,
    locator: assertionLocator,
  }];
};

export const analyzeRecordingEvents = (
  recording: {
    recordingId: string;
    name: string;
    envProfile: EnvProfile;
  },
  events: RecordingAnalysisEvent[],
): {
  dslPlan: WebStepPlanDraft;
  structuredPlan: Record<string, unknown>;
  dataTemplateDraft: ControlPlaneTemplateSchemaRecord;
} => {
  const steps = events.map<WebStepDraft>((event, index) => {
    const stepId = `recording-step-${index + 1}`;
    const payload = event.payload ?? {};
    const locator = event.locator ?? null;

    switch (event.eventType) {
      case 'open':
        return {
          stepId,
          name: `打开页面 ${index + 1}`,
          kind: 'navigation',
          action: 'open',
          input: {
            source: 'literal',
            value: typeof payload.url === 'string'
              ? payload.url
              : typeof event.pageUrl === 'string'
                ? event.pageUrl
                : '',
          },
        };
      case 'click':
        return {
          stepId,
          name: `点击元素 ${index + 1}`,
          kind: 'interaction',
          action: 'click',
          locator: locator ?? undefined,
        };
      case 'input':
        return {
          stepId,
          name: `输入内容 ${index + 1}`,
          kind: 'interaction',
          action: 'input',
          locator: locator ?? undefined,
          input: resolveEventInput('input', payload),
        };
      case 'upload':
        return {
          stepId,
          name: `上传文件 ${index + 1}`,
          kind: 'interaction',
          action: 'upload',
          locator: locator ?? undefined,
          input: resolveEventInput('upload', payload),
        };
      case 'assert':
        return {
          stepId,
          name: `断言结果 ${index + 1}`,
          kind: 'assertion',
          action: 'assert',
          assertions: resolveEventAssertions(locator, payload),
        };
      case 'wait':
        return {
          stepId,
          name: `等待 ${index + 1}`,
          kind: 'control',
          action: 'wait',
          timeoutMs: typeof payload.timeoutMs === 'number'
            ? payload.timeoutMs
            : typeof payload.timeout_ms === 'number'
              ? Number(payload.timeout_ms)
              : undefined,
        };
      default:
        throw new ControlPlaneRequestError(400, 'UNSUPPORTED_RECORDING_EVENT', `unsupported recording event type: ${event.eventType}`);
    }
  });

  const dslPlan: WebStepPlanDraft = {
    planId: `recording-${recording.recordingId}`,
    planName: recording.name,
    version: 'v1',
    browserProfile: recording.envProfile.browserProfile,
    defaults: {
      artifactPolicy: {
        screenshot: 'always',
        trace: 'always',
        video: 'none',
        domSnapshot: false,
        networkCapture: false,
      },
    },
    steps,
  };
  const dataTemplateDraft = deriveTemplateSchemaFromPlan(dslPlan);

  return {
    dslPlan,
    structuredPlan: {
      source: 'recording',
      recording_id: recording.recordingId,
      step_count: steps.length,
      steps,
    },
    dataTemplateDraft,
  };
};
