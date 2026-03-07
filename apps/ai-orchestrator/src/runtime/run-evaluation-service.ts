import type { AssistantMessage } from '../types.js';
import type { RunEvaluation, RunEvaluationVerdict } from '../types.js';
import type { ControlPlaneClient } from './control-plane-client.js';
import type { AiChatProvider } from './providers.js';
import type { OrchestrationStore } from './orchestration-store.js';
import type { SelfHealService } from './self-heal-service.js';

const isLocatorFailure = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return normalized.includes('locator') || normalized.includes('not found') || normalized.includes('timeout');
};

const isEnvironmentFailure = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return normalized.includes('econn') || normalized.includes('network') || normalized.includes('net::') || normalized.includes('dns');
};

const toAssistantMessages = (content: string): AssistantMessage[] => [{
  id: 'evaluation-user',
  threadId: 'evaluation',
  role: 'user',
  content,
  createdAt: new Date().toISOString(),
}];

export class RunEvaluationService {
  readonly #controlPlaneClient: ControlPlaneClient;
  readonly #provider: AiChatProvider;
  readonly #store: OrchestrationStore;
  readonly #selfHealService: SelfHealService;

  constructor(options: {
    controlPlaneClient: ControlPlaneClient;
    provider: AiChatProvider;
    store: OrchestrationStore;
    selfHealService: SelfHealService;
  }) {
    this.#controlPlaneClient = options.controlPlaneClient;
    this.#provider = options.provider;
    this.#store = options.store;
    this.#selfHealService = options.selfHealService;
  }

  async evaluateRunItem(input: {
    subjectId: string;
    tenantId: string;
    runItemId: string;
  }): Promise<RunEvaluation> {
    const actor = {
      subjectId: input.subjectId,
      tenantId: input.tenantId,
    };
    const runItem = await this.#controlPlaneClient.getRunItem(actor, input.runItemId);
    const run = await this.#controlPlaneClient.getRun(actor, String(runItem.run_id));
    const stepEvents = await this.#controlPlaneClient.listRunItemStepEvents(input.runItemId);
    const artifacts = await this.#controlPlaneClient.listRunItemArtifacts(input.runItemId);
    const latestSelfHealAttempt = await this.#selfHealService.getLatestSelfHealAttemptForRunItem(input.runItemId)
      ?? await this.#selfHealService.getLatestSelfHealAttemptByReplayRunId(String(run.id));

    const failedSteps = stepEvents.filter((item) => item.status === 'failed');
    const failedMessages = failedSteps
      .map((item) => typeof item.error_message === 'string' ? item.error_message : '')
      .filter((item) => item.length > 0);

    let verdict: RunEvaluationVerdict;
    if (run.status === 'succeeded' && latestSelfHealAttempt?.status === 'succeeded') {
      verdict = 'passed_with_runtime_self_heal';
    } else if (run.status === 'succeeded') {
      verdict = 'passed_as_expected';
    } else if (failedMessages.some(isEnvironmentFailure)) {
      verdict = 'failed_environment_issue';
    } else if (failedMessages.some(isLocatorFailure)) {
      verdict = 'failed_test_asset_issue';
    } else if (failedSteps.length > 0 || run.status === 'failed') {
      verdict = 'failed_functional_regression';
    } else {
      verdict = 'needs_human_review';
    }

    const deterministicSummary = {
      run_status: run.status,
      run_item_status: runItem.status,
      failed_step_count: failedSteps.length,
      failed_source_step_ids: failedSteps.map((item) => item.source_step_id),
      artifact_count: artifacts.length,
      self_heal_status: latestSelfHealAttempt?.status ?? null,
    };
    const evidence = failedSteps.slice(0, 5).map((item) => ({
      step_event_id: item.event_id,
      source_step_id: item.source_step_id,
      error_message: item.error_message,
      status: item.status,
    }));
    const linkedArtifactIds = artifacts
      .map((item) => typeof item.artifact_id === 'string' ? item.artifact_id : null)
      .filter((item): item is string => item != null);

    const explanation = await this.#buildExplanation({
      verdict,
      run,
      runItem,
      deterministicSummary,
      evidence,
      selfHealAttempt: latestSelfHealAttempt,
    });

    return this.#store.createRunEvaluation({
      tenantId: input.tenantId,
      projectId: String(runItem.project_id),
      runId: String(run.id),
      runItemId: input.runItemId,
      verdict,
      deterministicSummary,
      explanation,
      evidence,
      linkedArtifactIds,
      selfHealAttemptId: latestSelfHealAttempt?.id ?? null,
    });
  }

  async getRunEvaluation(runEvaluationId: string): Promise<RunEvaluation | null> {
    return this.#store.getRunEvaluation(runEvaluationId);
  }

  async #buildExplanation(input: {
    verdict: RunEvaluationVerdict;
    run: Record<string, unknown>;
    runItem: Record<string, unknown>;
    deterministicSummary: Record<string, unknown>;
    evidence: Record<string, unknown>[];
    selfHealAttempt: { id: string; status: string } | null;
  }): Promise<string> {
    if (this.#provider.name === 'mock') {
      return [
        `verdict=${input.verdict}`,
        `run=${String(input.run.id)} status=${String(input.run.status)}`,
        `runItem=${String(input.runItem.id)} status=${String(input.runItem.status)}`,
        input.selfHealAttempt ? `selfHeal=${input.selfHealAttempt.id}:${input.selfHealAttempt.status}` : 'selfHeal=none',
      ].join('\n');
    }

    return this.#provider.invoke({
      memoryFacts: [],
      messages: toAssistantMessages([
        '请基于以下确定性测试事实，给出 3-5 句中文解释。',
        '必须先给出结论，再说明依据，不要虚构未提供的事实。',
        JSON.stringify({
          verdict: input.verdict,
          deterministic_summary: input.deterministicSummary,
          evidence: input.evidence,
          self_heal_attempt: input.selfHealAttempt,
        }, null, 2),
      ].join('\n')),
      systemPrompt: '你是测试结果分析助手。你只能根据提供的运行事实做解释。',
    });
  }
}
