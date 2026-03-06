import { randomUUID } from 'node:crypto';
import type { CompileIssue, PlanExecutionResult, StepResult } from '@aiwtp/web-dsl-schema';
import type { WebWorkerResult } from '../job-runner/types.js';
import type { JobResultPayload, JobResultPayloadError, ResultEnvelopeFactory, ResultReportedEnvelope } from './types.js';

const firstFailedStep = (planResult?: PlanExecutionResult): StepResult | undefined =>
  planResult?.stepResults.find((step) => step.status === 'failed' || step.status === 'error');

const buildError = (result: WebWorkerResult): JobResultPayloadError | undefined => {
  const failedStep = firstFailedStep(result.planResult);
  if (failedStep?.errorCode || failedStep?.errorMessage) {
    return {
      code: failedStep.errorCode ?? 'PW_STEP_FAILED',
      message: failedStep.errorMessage ?? 'step execution failed',
    };
  }

  if (result.issues.length > 0) {
    const firstIssue: CompileIssue = result.issues[0];
    return {
      code: firstIssue.code,
      message: firstIssue.message,
      details: result.issues,
    };
  }

  return undefined;
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
  build(result: WebWorkerResult): ResultReportedEnvelope {
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
        error: buildError(result),
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
}
