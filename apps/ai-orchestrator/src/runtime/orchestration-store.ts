import { randomUUID } from 'node:crypto';

import type {
  CreateExplorationInput,
  CreateRunEvaluationInput,
  CreateSelfHealAttemptInput,
  ExplorationSession,
  RunEvaluation,
  SelfHealAttempt,
} from '../types.js';
import type { AiOrchestratorConfig } from './config.js';
import { PostgresOrchestrationStore } from './postgres-orchestration-store.js';

const clone = <T>(value: T): T => structuredClone(value);

const toTimestamp = (value: string | Date): number => {
  const normalized = value instanceof Date ? value.toISOString() : String(value);
  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

export interface UpdateExplorationInput {
  status?: ExplorationSession['status'];
  recordingId?: string | null;
  outputDir?: string | null;
  summary?: string | null;
  lastSnapshotMarkdown?: string | null;
  sampleDataset?: Record<string, unknown>;
  artifacts?: ExplorationSession['artifacts'];
  createdTestCaseId?: string | null;
  createdTestCaseVersionId?: string | null;
  defaultDatasetRowId?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface UpdateSelfHealAttemptInput {
  status?: SelfHealAttempt['status'];
  explanation?: string | null;
  overridePayload?: Record<string, unknown> | null;
  replayRunId?: string | null;
  replayRunStatus?: string | null;
  derivedTestCaseVersionId?: string | null;
}

export interface OrchestrationStore {
  readonly mode: 'memory' | 'postgres';
  createExploration(input: CreateExplorationInput): Promise<ExplorationSession>;
  getExploration(explorationId: string): Promise<ExplorationSession | null>;
  getLatestExplorationForThread(threadId: string): Promise<ExplorationSession | null>;
  updateExploration(explorationId: string, input: UpdateExplorationInput): Promise<ExplorationSession>;
  createSelfHealAttempt(input: CreateSelfHealAttemptInput): Promise<SelfHealAttempt>;
  getSelfHealAttempt(selfHealAttemptId: string): Promise<SelfHealAttempt | null>;
  getLatestSelfHealAttemptForRunItem(runItemId: string): Promise<SelfHealAttempt | null>;
  getLatestSelfHealAttemptByReplayRunId(replayRunId: string): Promise<SelfHealAttempt | null>;
  updateSelfHealAttempt(selfHealAttemptId: string, input: UpdateSelfHealAttemptInput): Promise<SelfHealAttempt>;
  createRunEvaluation(input: CreateRunEvaluationInput): Promise<RunEvaluation>;
  getRunEvaluation(runEvaluationId: string): Promise<RunEvaluation | null>;
  close(): Promise<void>;
}

export class InMemoryOrchestrationStore implements OrchestrationStore {
  readonly mode = 'memory' as const;
  readonly #explorations = new Map<string, ExplorationSession>();
  readonly #selfHealAttempts = new Map<string, SelfHealAttempt>();
  readonly #runEvaluations = new Map<string, RunEvaluation>();

  async createExploration(input: CreateExplorationInput): Promise<ExplorationSession> {
    const timestamp = new Date().toISOString();
    const exploration: ExplorationSession = {
      id: randomUUID(),
      threadId: input.threadId?.trim() || null,
      tenantId: input.tenantId.trim(),
      projectId: input.projectId.trim(),
      userId: input.userId?.trim() || null,
      status: 'draft',
      executionMode: input.executionMode ?? 'ai',
      name: input.name?.trim() || null,
      instruction: input.instruction.trim(),
      startUrl: input.startUrl.trim(),
      recordingId: null,
      outputDir: null,
      summary: null,
      lastSnapshotMarkdown: null,
      sampleDataset: {},
      artifacts: [],
      createdTestCaseId: null,
      createdTestCaseVersionId: null,
      defaultDatasetRowId: null,
      startedAt: null,
      finishedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.#explorations.set(exploration.id, exploration);
    return clone(exploration);
  }

  async getExploration(explorationId: string): Promise<ExplorationSession | null> {
    const exploration = this.#explorations.get(explorationId);
    return exploration ? clone(exploration) : null;
  }

  async getLatestExplorationForThread(threadId: string): Promise<ExplorationSession | null> {
    const items = [...this.#explorations.values()]
      .filter((item) => item.threadId === threadId)
      .sort((left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt));
    return items[0] ? clone(items[0]) : null;
  }

  async updateExploration(explorationId: string, input: UpdateExplorationInput): Promise<ExplorationSession> {
    const existing = this.#explorations.get(explorationId);
    if (!existing) {
      throw new Error(`exploration not found: ${explorationId}`);
    }

    const updated: ExplorationSession = {
      ...existing,
      ...input,
      sampleDataset: input.sampleDataset ? clone(input.sampleDataset) : existing.sampleDataset,
      artifacts: input.artifacts ? clone(input.artifacts) : existing.artifacts,
      updatedAt: new Date().toISOString(),
    };
    this.#explorations.set(explorationId, updated);
    return clone(updated);
  }

  async createSelfHealAttempt(input: CreateSelfHealAttemptInput): Promise<SelfHealAttempt> {
    const timestamp = new Date().toISOString();
    const attempt: SelfHealAttempt = {
      id: randomUUID(),
      tenantId: input.tenantId.trim(),
      projectId: input.projectId.trim(),
      runId: input.runId,
      runItemId: input.runItemId,
      failedStepEventId: input.failedStepEventId ?? null,
      sourceStepId: input.sourceStepId,
      failureCategory: input.failureCategory,
      strategySummary: input.strategySummary,
      explanation: input.explanation ?? null,
      overridePayload: input.overridePayload ? clone(input.overridePayload) : null,
      replayRunId: input.replayRunId ?? null,
      replayRunStatus: input.replayRunStatus ?? null,
      derivedTestCaseVersionId: input.derivedTestCaseVersionId ?? null,
      status: input.status,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.#selfHealAttempts.set(attempt.id, attempt);
    return clone(attempt);
  }

  async getSelfHealAttempt(selfHealAttemptId: string): Promise<SelfHealAttempt | null> {
    const attempt = this.#selfHealAttempts.get(selfHealAttemptId);
    return attempt ? clone(attempt) : null;
  }

  async getLatestSelfHealAttemptForRunItem(runItemId: string): Promise<SelfHealAttempt | null> {
    const items = [...this.#selfHealAttempts.values()]
      .filter((item) => item.runItemId === runItemId)
      .sort((left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt));
    return items[0] ? clone(items[0]) : null;
  }

  async getLatestSelfHealAttemptByReplayRunId(replayRunId: string): Promise<SelfHealAttempt | null> {
    const items = [...this.#selfHealAttempts.values()]
      .filter((item) => item.replayRunId === replayRunId)
      .sort((left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt));
    return items[0] ? clone(items[0]) : null;
  }

  async updateSelfHealAttempt(selfHealAttemptId: string, input: UpdateSelfHealAttemptInput): Promise<SelfHealAttempt> {
    const existing = this.#selfHealAttempts.get(selfHealAttemptId);
    if (!existing) {
      throw new Error(`self-heal attempt not found: ${selfHealAttemptId}`);
    }

    const updated: SelfHealAttempt = {
      ...existing,
      ...input,
      overridePayload: input.overridePayload ? clone(input.overridePayload) : existing.overridePayload,
      updatedAt: new Date().toISOString(),
    };
    this.#selfHealAttempts.set(selfHealAttemptId, updated);
    return clone(updated);
  }

  async createRunEvaluation(input: CreateRunEvaluationInput): Promise<RunEvaluation> {
    const timestamp = new Date().toISOString();
    const evaluation: RunEvaluation = {
      id: randomUUID(),
      tenantId: input.tenantId.trim(),
      projectId: input.projectId.trim(),
      runId: input.runId,
      runItemId: input.runItemId,
      verdict: input.verdict,
      deterministicSummary: clone(input.deterministicSummary),
      explanation: input.explanation,
      evidence: clone(input.evidence ?? []),
      linkedArtifactIds: [...(input.linkedArtifactIds ?? [])],
      selfHealAttemptId: input.selfHealAttemptId ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.#runEvaluations.set(evaluation.id, evaluation);
    return clone(evaluation);
  }

  async getRunEvaluation(runEvaluationId: string): Promise<RunEvaluation | null> {
    const evaluation = this.#runEvaluations.get(runEvaluationId);
    return evaluation ? clone(evaluation) : null;
  }

  async close(): Promise<void> {}
}

export const createOrchestrationStore = async (config: AiOrchestratorConfig): Promise<OrchestrationStore> => {
  if (config.storeMode === 'postgres') {
    const store = new PostgresOrchestrationStore(config);
    await store.initialize();
    return store;
  }

  return new InMemoryOrchestrationStore();
};
