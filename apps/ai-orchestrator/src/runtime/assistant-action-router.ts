import type { AssistantActionResult, AssistantThread } from '../types.js';
import type { ExplorationService } from './exploration-service.js';
import type { RunEvaluationService } from './run-evaluation-service.js';
import type { SelfHealService } from './self-heal-service.js';

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

const includesAny = (value: string, patterns: string[]): boolean =>
  patterns.some((pattern) => value.includes(pattern));

const TRAILING_URL_PUNCTUATION = /[),.;!?'"，。！？；、）】》]+$/u;

const extractUrl = (value: string): string | null => {
  const match = value.match(/https?:\/\/[^\s，。！？；、）】》"'`]+/i);
  if (!match) {
    return null;
  }

  return match[0].replace(TRAILING_URL_PUNCTUATION, '');
};

const extractUuid = (value: string): string | null => {
  const match = value.match(UUID_PATTERN);
  return match?.[0] ?? null;
};

export class AssistantActionRouter {
  readonly #explorationService: ExplorationService;
  readonly #selfHealService: SelfHealService;
  readonly #runEvaluationService: RunEvaluationService;

  constructor(options: {
    explorationService: ExplorationService;
    selfHealService: SelfHealService;
    runEvaluationService: RunEvaluationService;
  }) {
    this.#explorationService = options.explorationService;
    this.#selfHealService = options.selfHealService;
    this.#runEvaluationService = options.runEvaluationService;
  }

  async route(thread: AssistantThread, userInput: string): Promise<AssistantActionResult | null> {
    const normalized = userInput.trim().toLowerCase();
    const subjectId = thread.userId ?? 'assistant-user';
    const latestExploration = await this.#explorationService.getLatestExplorationForThread(thread.id);

    if (includesAny(normalized, ['探索', '录屏', 'explore', 'record']) && extractUrl(userInput)) {
      if (!thread.tenantId || !thread.projectId) {
        return {
          kind: 'none',
          summary: '当前 thread 缺少 tenantId 或 projectId，无法启动 exploration。',
        };
      }

      const exploration = await this.#explorationService.createExploration({
        tenantId: thread.tenantId,
        projectId: thread.projectId,
        threadId: thread.id,
        userId: thread.userId ?? undefined,
        instruction: userInput,
        startUrl: extractUrl(userInput) ?? '',
        executionMode: 'ai',
        name: `assistant exploration ${thread.id}`,
      });
      const started = await this.#explorationService.startExploration(exploration.id, subjectId);
      return {
        kind: 'exploration_started',
        summary: `已启动 exploration ${started.id}，recording=${started.recordingId ?? 'pending'}。`,
        payload: {
          explorationId: started.id,
          recordingId: started.recordingId,
          status: started.status,
        },
      };
    }

    if (latestExploration && includesAny(normalized, ['停止探索', 'stop exploration', '结束录屏'])) {
      const stopped = await this.#explorationService.stopExploration(latestExploration.id);
      return {
        kind: 'exploration_status',
        summary: `exploration ${stopped.id} 已停止，artifactCount=${stopped.artifacts.length}。`,
        payload: {
          explorationId: stopped.id,
          status: stopped.status,
          artifactCount: stopped.artifacts.length,
        },
      };
    }

    if (latestExploration && includesAny(normalized, ['当前页面', '页面上', 'browser:', '浏览器:'])) {
      const assist = await this.#explorationService.browserAssist(latestExploration.id, userInput);
      return {
        kind: 'browser_assist',
        summary: assist.reply,
        payload: {
          explorationId: assist.exploration.id,
        },
      };
    }

    if (latestExploration && includesAny(normalized, ['生成case', '生成用例', 'publish case', 'publish test case'])) {
      const published = await this.#explorationService.publishExplorationCase(latestExploration.id, {
        subjectId,
        publish: false,
      });
      return {
        kind: 'case_published',
        summary: `已从 exploration ${published.exploration.id} 生成 draft case version ${published.versionId}。`,
        payload: {
          explorationId: published.exploration.id,
          testCaseId: published.testCaseId,
          versionId: published.versionId,
          defaultDatasetRowId: published.defaultDatasetRowId,
        },
      };
    }

    const runItemId = extractUuid(userInput);
    if (runItemId && includesAny(normalized, ['自愈', 'self-heal', 'heal'])) {
      if (!thread.tenantId) {
        return {
          kind: 'none',
          summary: '当前 thread 缺少 tenantId，无法执行 self-heal。',
        };
      }

      const attempt = await this.#selfHealService.executeSelfHeal({
        subjectId,
        tenantId: thread.tenantId,
        runItemId,
      });
      return {
        kind: 'self_heal_started',
        summary: `self-heal ${attempt.id} 已完成，status=${attempt.status}，replayRun=${attempt.replayRunId ?? 'n/a'}。`,
        payload: {
          selfHealAttemptId: attempt.id,
          replayRunId: attempt.replayRunId,
          replayRunStatus: attempt.replayRunStatus,
          derivedTestCaseVersionId: attempt.derivedTestCaseVersionId,
        },
      };
    }

    if (runItemId && includesAny(normalized, ['评估', 'evaluate', '结果分析'])) {
      if (!thread.tenantId) {
        return {
          kind: 'none',
          summary: '当前 thread 缺少 tenantId，无法评估 run item。',
        };
      }

      const evaluation = await this.#runEvaluationService.evaluateRunItem({
        subjectId,
        tenantId: thread.tenantId,
        runItemId,
      });
      return {
        kind: 'run_evaluated',
        summary: `run evaluation ${evaluation.id} verdict=${evaluation.verdict}。`,
        payload: {
          runEvaluationId: evaluation.id,
          verdict: evaluation.verdict,
        },
      };
    }

    if (latestExploration && includesAny(normalized, ['最近探索', 'latest exploration', 'exploration status'])) {
      return {
        kind: 'exploration_status',
        summary: `最近 exploration=${latestExploration.id} status=${latestExploration.status} recording=${latestExploration.recordingId ?? 'n/a'}。`,
        payload: {
          explorationId: latestExploration.id,
          status: latestExploration.status,
          recordingId: latestExploration.recordingId,
        },
      };
    }

    return null;
  }
}
