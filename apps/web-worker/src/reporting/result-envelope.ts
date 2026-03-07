import { randomUUID } from 'node:crypto';
import type { CompileIssue, PlanExecutionResult, StepResult } from '@aiwtp/web-dsl-schema';
import type { JobMetadata, WebWorkerResult } from '../job-runner/types.js';
import type {
  JobResultPayload,
  JobResultPayloadError,
  ResultEnvelopeFactory,
  ResultReportedEnvelope,
  StepResultPayload,
  StepResultReportedEnvelope,
} from './types.js';

const firstFailedStep = (planResult?: PlanExecutionResult): StepResult | undefined =>
  planResult?.stepResults.find((step) => step.status === 'failed' || step.status === 'error');

const buildErrorFromIssue = (issues: CompileIssue[]): JobResultPayloadError | undefined => {
  if (issues.length === 0) {
    return undefined;
  }

  const firstIssue = issues[0];
  return {
    code: firstIssue.code,
    message: firstIssue.message,
    details: issues,
  };
};

const buildStepError = (stepResult: StepResult): JobResultPayloadError | undefined => {
  if (!stepResult.errorCode && !stepResult.errorMessage) {
    return undefined;
  }

  return {
    code: stepResult.errorCode ?? 'PW_STEP_FAILED',
    message: stepResult.errorMessage ?? 'step execution failed',
  };
};

const buildJobError = (result: WebWorkerResult): JobResultPayloadError | undefined => {
  const failedStep = firstFailedStep(result.planResult);
  if (failedStep) {
    return buildStepError(failedStep);
  }

  return buildErrorFromIssue(result.issues);
};

const toPayloadStatus = (status: WebWorkerResult['status']): JobResultPayload['status'] => {
  switch (status) {
    case 'executed':
      return 'passed';
    case 'compile_failed':
    case 'execution_failed':
      return 'failed';
    case 'compiled':
      return 'failed';
  }
};

const collectArtifacts = (planResult?: PlanExecutionResult) => planResult?.stepResults.flatMap((step) => step.artifacts) ?? [];

export class DefaultResultEnvelopeFactory implements ResultEnvelopeFactory {
  buildJobResult(result: WebWorkerResult): ResultReportedEnvelope {
    return {
      event_id: randomUUID(),
      event_type: 'job.result_reported',
      schema_version: '1.0',
      occurred_at: new Date().toISOString(),
      tenant_id: result.metadata.tenantId,
      project_id: result.metadata.projectId,
      trace_id: result.metadata.traceId,
      correlation_id: result.metadata.correlationId,
      payload: {
        job_id: result.metadata.jobId,
        run_id: result.metadata.runId,
        run_item_id: result.metadata.runItemId,
        attempt_no: result.metadata.attemptNo,
        status: toPayloadStatus(result.status),
        started_at: result.planResult?.startedAt,
        finished_at: result.planResult?.finishedAt,
        error: buildJobError(result),
        artifacts: collectArtifacts(result.planResult),
        usage: result.planResult
          ? {
              duration_ms: result.planResult.durationMs,
              step_count: result.planResult.stepResults.length,
            }
          : undefined,
      },
    };
  }

  buildStepResult(metadata: JobMetadata, stepResult: StepResult): StepResultReportedEnvelope {
    const payload: StepResultPayload = {
      job_id: metadata.jobId,
      run_id: metadata.runId,
      run_item_id: metadata.runItemId,
      attempt_no: metadata.attemptNo,
      compiled_step_id: stepResult.compiledStepId,
      source_step_id: stepResult.sourceStepId,
      status: stepResult.status,
      started_at: stepResult.startedAt,
      finished_at: stepResult.finishedAt,
      duration_ms: stepResult.durationMs,
      error: buildStepError(stepResult),
      artifacts: stepResult.artifacts,
      extracted_variables: stepResult.extractedVariables,
    };

    return {
      event_id: randomUUID(),
      event_type: 'step.result_reported',
      schema_version: '1.0',
      occurred_at: new Date().toISOString(),
      tenant_id: metadata.tenantId,
      project_id: metadata.projectId,
      trace_id: metadata.traceId,
      correlation_id: metadata.correlationId,
      payload,
    };
  }
}
