import type { CompiledStep } from '@aiwtp/web-dsl-schema';
import type { ExecutionSession, StepControlDecision, StepExecutionController } from '@aiwtp/playwright-adapter';
import type { JobMetadata } from '../job-runner/types.js';
import type { HttpStepControllerConfig, StepControlRequest, StepControlResponse } from './types.js';

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export class HttpStepController implements StepExecutionController {
  constructor(
    private readonly metadata: JobMetadata,
    private readonly config: HttpStepControllerConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async beforeStep(step: CompiledStep, session: ExecutionSession): Promise<StepControlDecision> {
    for (;;) {
      const decision = await this.fetchDecision(step, session);

      switch (decision.action) {
        case 'execute':
          return { action: 'execute' };
        case 'cancel':
          return {
            action: 'cancel',
            reason: decision.reason ?? 'step canceled by remote controller',
          };
        case 'skip':
          return {
            action: 'skip',
            reason: decision.reason ?? 'step skipped by remote controller',
          };
        case 'replace':
          return {
            action: 'execute',
            replacementStep: decision.replacement_step,
          };
        case 'pause':
          await sleep(decision.resume_after_ms ?? this.config.pausePollIntervalMs ?? 500);
          break;
      }
    }
  }

  private async fetchDecision(step: CompiledStep, session: ExecutionSession): Promise<StepControlResponse> {
    const requestBody = this.buildRequest(step, session);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 5000);

    try {
      const response = await this.fetchImpl(this.resolveEndpoint(step), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.config.authToken ? { authorization: `Bearer ${this.config.authToken}` } : {}),
          ...(this.config.additionalHeaders ?? {}),
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (response.status === 204) {
        return { action: 'execute' };
      }

      if (!response.ok) {
        throw new Error(`step control request failed: ${response.status} ${response.statusText}`);
      }

      const rawText = await response.text();
      if (!rawText.trim()) {
        return { action: 'execute' };
      }

      return this.parseDecision(JSON.parse(rawText));
    } catch (error) {
      if (this.config.failOpen) {
        return { action: 'execute' };
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildRequest(step: CompiledStep, session: ExecutionSession): StepControlRequest {
    return {
      job_id: this.metadata.jobId,
      run_id: this.metadata.runId,
      run_item_id: this.metadata.runItemId,
      attempt_no: this.metadata.attemptNo,
      tenant_id: this.metadata.tenantId,
      project_id: this.metadata.projectId,
      trace_id: this.metadata.traceId,
      correlation_id: this.metadata.correlationId,
      compiled_step_id: step.compiledStepId,
      source_step_id: step.sourceStepId,
      step_name: step.name,
      page_url: session.page.url(),
      compiled_step: step,
    };
  }

  private resolveEndpoint(step: CompiledStep): string {
    return this.config.endpoint
      .replaceAll('{job_id}', encodeURIComponent(this.metadata.jobId))
      .replaceAll('{run_id}', encodeURIComponent(this.metadata.runId))
      .replaceAll('{run_item_id}', encodeURIComponent(this.metadata.runItemId))
      .replaceAll('{source_step_id}', encodeURIComponent(step.sourceStepId))
      .replaceAll('{compiled_step_id}', encodeURIComponent(step.compiledStepId));
  }

  private parseDecision(value: unknown): StepControlResponse {
    if (!isObject(value) || typeof value.action !== 'string') {
      throw new Error('invalid step control response: action is required');
    }

    if (value.action === 'execute') {
      return { action: 'execute' };
    }

    if (value.action === 'cancel') {
      return {
        action: 'cancel',
        reason: typeof value.reason === 'string' ? value.reason : undefined,
      };
    }

    if (value.action === 'skip') {
      return {
        action: 'skip',
        reason: typeof value.reason === 'string' ? value.reason : undefined,
      };
    }

    if (value.action === 'pause') {
      return {
        action: 'pause',
        resume_after_ms: typeof value.resume_after_ms === 'number' ? value.resume_after_ms : undefined,
      };
    }

    if (value.action === 'replace') {
      if (!isObject(value.replacement_step)) {
        throw new Error('invalid step control response: replacement_step is required for replace');
      }

      return {
        action: 'replace',
        replacement_step: value.replacement_step as unknown as CompiledStep,
      };
    }

    throw new Error(`invalid step control response: unsupported action ${value.action}`);
  }
}
