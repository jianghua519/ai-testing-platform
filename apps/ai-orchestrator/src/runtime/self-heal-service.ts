import { DefaultDslCompiler } from '@aiwtp/dsl-compiler';
import type { CompiledStep } from '@aiwtp/web-dsl-schema';

import type { SelfHealAttempt } from '../types.js';
import type { ControlPlaneClient } from './control-plane-client.js';
import type { OrchestrationStore } from './orchestration-store.js';

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const classifyFailure = (message: string | null | undefined): string => {
  const normalized = (message ?? '').toLowerCase();
  if (normalized.includes('locator') || normalized.includes('not found') || normalized.includes('timeout')) {
    return 'locator_drift';
  }
  if (normalized.includes('econn') || normalized.includes('network') || normalized.includes('net::')) {
    return 'environment_issue';
  }
  return 'unknown';
};

const findSourceStep = (plan: Record<string, unknown>, sourceStepId: string): Record<string, unknown> | null => {
  const steps = Array.isArray(plan.steps) ? plan.steps as Record<string, unknown>[] : [];
  for (const step of steps) {
    if (String(step.stepId ?? step.step_id ?? '') === sourceStepId) {
      return step;
    }
  }
  return null;
};

interface FailedStepContext {
  eventId: string | null;
  sourceStepId: string;
  errorMessage: string | null;
  failureCategory: string;
}

const waitFor = async <T>(
  fn: () => Promise<T | false>,
  options: { timeoutMs?: number; intervalMs?: number; label: string },
): Promise<T> => {
  const deadline = Date.now() + (options.timeoutMs ?? 120000);
  let lastError: Error | null = null;

  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value !== false) {
        return value;
      }
    } catch (error) {
      lastError = error as Error;
    }
    await sleep(options.intervalMs ?? 500);
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error(`timed out waiting for ${options.label}`);
};

export class SelfHealService {
  readonly #controlPlaneClient: ControlPlaneClient;
  readonly #store: OrchestrationStore;
  readonly #compiler = new DefaultDslCompiler();

  constructor(options: {
    controlPlaneClient: ControlPlaneClient;
    store: OrchestrationStore;
  }) {
    this.#controlPlaneClient = options.controlPlaneClient;
    this.#store = options.store;
  }

  async executeSelfHeal(input: {
    subjectId: string;
    tenantId: string;
    runItemId: string;
    deriveDraftVersionOnSuccess?: boolean;
  }): Promise<SelfHealAttempt> {
    const actor = {
      subjectId: input.subjectId,
      tenantId: input.tenantId,
    };
    const runItem = await this.#controlPlaneClient.getRunItem(actor, input.runItemId);
    const summary = (runItem.summary ?? {}) as Record<string, unknown>;
    const runId = String(runItem.run_id);
    const projectId = String(runItem.project_id);
    const failedVersionId = String(summary.test_case_version_id ?? '');
    const datasetRowId = typeof summary.dataset_row_id === 'string' ? summary.dataset_row_id : undefined;
    if (!failedVersionId) {
      throw new Error(`run item is not bound to a test case version: ${input.runItemId}`);
    }

    const initialFailure = await this.#getRequiredFailedStep(input.runItemId);

    const failedVersion = await this.#controlPlaneClient.getTestCaseVersion(actor, failedVersionId);
    const testCaseId = String(failedVersion.test_case_id ?? '');
    const failedPlan = failedVersion.plan as Record<string, unknown>;
    if (!testCaseId || !failedPlan) {
      throw new Error(`failed version is missing plan or test case id: ${failedVersionId}`);
    }

    const replacementSteps = new Map<string, CompiledStep>();
    let currentFailure = initialFailure;
    let strategySummary = `Replace step ${currentFailure.sourceStepId} using locator/assertion from a healthy test case version`;
    let latestReplayRunItemId: string | null = null;

    let attempt = await this.#store.createSelfHealAttempt({
      tenantId: input.tenantId,
      projectId,
      runId,
      runItemId: input.runItemId,
      failedStepEventId: currentFailure.eventId,
      sourceStepId: currentFailure.sourceStepId,
      failureCategory: currentFailure.failureCategory,
      strategySummary,
      explanation: currentFailure.errorMessage,
      overridePayload: null,
      status: 'queued',
    });

    for (let iteration = 0; iteration < 4; iteration += 1) {
      if (!replacementSteps.has(currentFailure.sourceStepId)) {
        const candidateVersion = await this.#selectRecoveryVersion(
          actor,
          testCaseId,
          failedVersionId,
          currentFailure.sourceStepId,
        );
        if (!candidateVersion) {
          throw new Error(`no recovery version found for failed step ${currentFailure.sourceStepId}`);
        }

        const replacementStep = await this.#compileReplacementStep(
          candidateVersion.plan as Record<string, unknown>,
          candidateVersion.env_profile as Record<string, unknown>,
          currentFailure.sourceStepId,
        );
        if (!replacementStep) {
          throw new Error(`compiled replacement step not found for source step ${currentFailure.sourceStepId}`);
        }

        replacementSteps.set(currentFailure.sourceStepId, replacementStep);
        strategySummary = `Replace steps ${[...replacementSteps.keys()].join(', ')} using healthy version ${String(candidateVersion.id)}`;
      }

      attempt = await this.#store.updateSelfHealAttempt(attempt.id, {
        status: 'running',
        explanation: currentFailure.errorMessage,
        overridePayload: {
          action: 'replace_many',
          replacements: [...replacementSteps.entries()].map(([sourceStepId, replacementStep]) => ({
            source_step_id: sourceStepId,
            replacement_step: replacementStep,
          })),
        },
      });

      const replayRun = await this.#controlPlaneClient.createRun(actor, {
        tenantId: input.tenantId,
        projectId,
        name: `self-heal replay for ${input.runItemId}`,
        mode: 'standard',
        selection: {
          kind: 'case_version',
          test_case_version_id: failedVersionId,
          dataset_row_id: datasetRowId,
        },
      });
      const replayRunId = String(replayRun.id);

      attempt = await this.#store.updateSelfHealAttempt(attempt.id, {
        replayRunId,
        replayRunStatus: typeof replayRun.status === 'string' ? replayRun.status : 'created',
      });

      const replayRunItem = await waitFor(async () => {
        const items = await this.#controlPlaneClient.listRunItems(actor, replayRunId);
        return items[0] ? items[0] as Record<string, unknown> : false;
      }, {
        label: `replay run item ${replayRunId}`,
      });
      latestReplayRunItemId = String(replayRunItem.id);
      const replaySummary = (replayRunItem.summary ?? {}) as Record<string, unknown>;
      const replayJobId = String(replaySummary.job_id ?? '');
      if (!replayJobId) {
        throw new Error(`replay run item is missing job_id: ${replayRunId}`);
      }

      for (const [sourceStepId, replacementStep] of replacementSteps.entries()) {
        await this.#controlPlaneClient.enqueueStepOverride(replayJobId, sourceStepId, {
          action: 'replace',
          reason: strategySummary,
          replacementStep: replacementStep as unknown as Record<string, unknown>,
          tenantId: input.tenantId,
          runId: replayRunId,
          runItemId: latestReplayRunItemId,
        });
      }

      const completedRun = await waitFor(async () => {
        const run = await this.#controlPlaneClient.getRun(actor, replayRunId);
        return ['succeeded', 'failed', 'canceled'].includes(String(run.status)) ? run : false;
      }, {
        label: `replay run ${replayRunId}`,
        timeoutMs: 180000,
      });

      if (completedRun.status === 'succeeded') {
        let derivedVersionId: string | null = null;
        if (input.deriveDraftVersionOnSuccess !== false && latestReplayRunItemId) {
          const extracted = await this.#controlPlaneClient.extractTestCaseFromRunItem(actor, latestReplayRunItemId, {
            versionLabel: 'self-heal-derived',
            changeSummary: 'extract from self-healed replay run',
            publish: false,
            defaultDatasetName: 'self-heal-default',
          });
          const extractedVersion = ((extracted as Record<string, unknown>).version ?? {}) as Record<string, unknown>;
          derivedVersionId = typeof extractedVersion.id === 'string' ? extractedVersion.id : null;
        }

        return this.#store.updateSelfHealAttempt(attempt.id, {
          status: 'succeeded',
          replayRunStatus: String(completedRun.status),
          derivedTestCaseVersionId: derivedVersionId,
        });
      }

      const nextFailure = latestReplayRunItemId
        ? await this.#getLatestFailedStep(latestReplayRunItemId)
        : null;
      if (!nextFailure || replacementSteps.has(nextFailure.sourceStepId)) {
        return this.#store.updateSelfHealAttempt(attempt.id, {
          status: 'failed',
          replayRunStatus: String(completedRun.status),
          explanation: nextFailure?.errorMessage ?? currentFailure.errorMessage,
        });
      }

      currentFailure = nextFailure;
    }

    return this.#store.updateSelfHealAttempt(attempt.id, {
      status: 'failed',
      replayRunStatus: attempt.replayRunStatus,
      explanation: currentFailure.errorMessage,
    });
  }

  async getSelfHealAttempt(selfHealAttemptId: string): Promise<SelfHealAttempt | null> {
    return this.#store.getSelfHealAttempt(selfHealAttemptId);
  }

  async getLatestSelfHealAttemptForRunItem(runItemId: string): Promise<SelfHealAttempt | null> {
    return this.#store.getLatestSelfHealAttemptForRunItem(runItemId);
  }

  async getLatestSelfHealAttemptByReplayRunId(replayRunId: string): Promise<SelfHealAttempt | null> {
    return this.#store.getLatestSelfHealAttemptByReplayRunId(replayRunId);
  }

  async #selectRecoveryVersion(
    actor: { subjectId: string; tenantId: string },
    testCaseId: string,
    failedVersionId: string,
    sourceStepId: string,
  ): Promise<Record<string, unknown> | null> {
    const versions = await this.#controlPlaneClient.listTestCaseVersions(actor, testCaseId);
    const sorted = [...versions].sort((left, right) =>
      Number(right.version_no ?? 0) - Number(left.version_no ?? 0),
    );

    for (const version of sorted) {
      if (String(version.id) === failedVersionId) {
        continue;
      }
      const step = findSourceStep(version.plan as Record<string, unknown>, sourceStepId);
      if (step) {
        return version;
      }
    }

    return null;
  }

  async #compileReplacementStep(
    plan: Record<string, unknown>,
    envProfile: Record<string, unknown>,
    sourceStepId: string,
  ): Promise<CompiledStep | null> {
    const compileResponse = await this.#compiler.compile({
      sourcePlan: plan as unknown as Parameters<DefaultDslCompiler['compile']>[0]['sourcePlan'],
      envProfile: envProfile as unknown as Parameters<DefaultDslCompiler['compile']>[0]['envProfile'],
    });

    const compiledPlan = compileResponse.compiledPlan;
    if (!compiledPlan) {
      throw new Error('failed to compile recovery plan');
    }

    return compiledPlan.compiledSteps.find((step: CompiledStep) => step.sourceStepId === sourceStepId) ?? null;
  }

  async #getLatestFailedStep(runItemId: string): Promise<FailedStepContext | null> {
    const stepEvents = await this.#controlPlaneClient.listRunItemStepEvents(runItemId);
    const failedStep = [...stepEvents]
      .reverse()
      .find((item) => item.status === 'failed') as Record<string, unknown> | undefined;
    if (!failedStep) {
      return null;
    }

    const sourceStepId = String(failedStep.source_step_id ?? '');
    if (!sourceStepId) {
      return null;
    }

    const errorMessage = typeof failedStep.error_message === 'string' ? failedStep.error_message : null;
    return {
      eventId: typeof failedStep.event_id === 'string' ? failedStep.event_id : null,
      sourceStepId,
      errorMessage,
      failureCategory: classifyFailure(errorMessage),
    };
  }

  async #getRequiredFailedStep(runItemId: string): Promise<FailedStepContext> {
    const failedStep = await this.#getLatestFailedStep(runItemId);
    if (!failedStep) {
      throw new Error(`no failed step event found for run item: ${runItemId}`);
    }

    return failedStep;
  }
}
