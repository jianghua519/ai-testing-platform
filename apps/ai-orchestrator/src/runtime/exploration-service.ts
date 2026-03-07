import path from 'node:path';

import type {
  CreateExplorationInput,
  ExplorationPublishResult,
  ExplorationSession,
  PublishExplorationCaseInput,
} from '../types.js';
import type { AiOrchestratorConfig } from './config.js';
import { BrowserSessionBroker } from './browser-session-broker.js';
import type { ControlPlaneClient } from './control-plane-client.js';
import type { OrchestrationStore } from './orchestration-store.js';

const buildExplorationEnvProfile = (config: AiOrchestratorConfig) => ({
  profileId: 'ai-orchestrator-exploration',
  browserProfile: {
    browser: config.playwrightBrowser,
    headless: config.playwrightHeadless,
    viewport: {
      width: config.playwrightVideoWidth,
      height: config.playwrightVideoHeight,
    },
  },
});

export class ExplorationService {
  readonly #config: AiOrchestratorConfig;
  readonly #store: OrchestrationStore;
  readonly #controlPlaneClient: ControlPlaneClient;
  readonly #browserBroker: BrowserSessionBroker;

  constructor(options: {
    config: AiOrchestratorConfig;
    store: OrchestrationStore;
    controlPlaneClient: ControlPlaneClient;
    browserBroker: BrowserSessionBroker;
  }) {
    this.#config = options.config;
    this.#store = options.store;
    this.#controlPlaneClient = options.controlPlaneClient;
    this.#browserBroker = options.browserBroker;
  }

  async createExploration(input: CreateExplorationInput): Promise<ExplorationSession> {
    return this.#store.createExploration(input);
  }

  async getExploration(explorationId: string): Promise<ExplorationSession | null> {
    return this.#store.getExploration(explorationId);
  }

  async getLatestExplorationForThread(threadId: string): Promise<ExplorationSession | null> {
    return this.#store.getLatestExplorationForThread(threadId);
  }

  async startExploration(explorationId: string, subjectId: string): Promise<ExplorationSession> {
    const exploration = await this.#getRequiredExploration(explorationId);
    const actor = {
      subjectId,
      tenantId: exploration.tenantId,
    };
    const startedAt = exploration.startedAt ?? new Date().toISOString();
    const recordingId = exploration.recordingId
      ?? String((await this.#controlPlaneClient.createRecording(actor, {
        tenantId: exploration.tenantId,
        projectId: exploration.projectId,
        name: exploration.name ?? `AI exploration ${exploration.id}`,
        sourceType: 'auto_explore',
        envProfile: buildExplorationEnvProfile(this.#config),
      })).id);

    const result = await this.#browserBroker.runExploration({
      exploration,
      executionMode: exploration.executionMode,
      instruction: exploration.instruction,
      startUrl: exploration.startUrl,
      recordStepContext: {
        recordingId,
        appendEvent: async (event) => {
          await this.#controlPlaneClient.appendRecordingEvents(actor, recordingId, [{
            event_type: event.eventType,
            page_url: event.pageUrl ?? undefined,
            locator: event.locator ? {
              strategy: event.locator.strategy,
              value: event.locator.value,
            } : undefined,
            payload: event.payload,
            captured_at: event.capturedAt ?? undefined,
          }]);
        },
        updateSampleDataset: async (values) => {
          await this.#store.updateExploration(explorationId, {
            sampleDataset: values,
          });
        },
      },
    });

    return this.#store.updateExploration(explorationId, {
      status: 'running',
      recordingId,
      summary: result.summary,
      lastSnapshotMarkdown: result.lastSnapshotMarkdown,
      sampleDataset: result.sampleDataset,
      startedAt,
    });
  }

  async stopExploration(explorationId: string): Promise<ExplorationSession> {
    const exploration = await this.#getRequiredExploration(explorationId);
    const artifacts = await this.#browserBroker.stopSession(explorationId);
    return this.#store.updateExploration(explorationId, {
      status: exploration.status === 'failed' ? 'failed' : 'succeeded',
      artifacts,
      outputDir: artifacts[0]?.path ? path.dirname(artifacts[0].path) : exploration.outputDir,
      finishedAt: new Date().toISOString(),
    });
  }

  async markExplorationFailed(explorationId: string, message: string): Promise<ExplorationSession> {
    return this.#store.updateExploration(explorationId, {
      status: 'failed',
      summary: message,
      finishedAt: new Date().toISOString(),
    });
  }

  async publishExplorationCase(explorationId: string, input: PublishExplorationCaseInput): Promise<ExplorationPublishResult> {
    const exploration = await this.#getRequiredExploration(explorationId);
    if (!exploration.recordingId) {
      throw new Error(`exploration recording is missing: ${explorationId}`);
    }

    const actor = {
      subjectId: input.subjectId,
      tenantId: exploration.tenantId,
    };
    const analysisJob = await this.#controlPlaneClient.analyzeRecording(actor, exploration.recordingId);
    const published = await this.#controlPlaneClient.publishRecordingAsTestCase(actor, exploration.recordingId, {
      analysisJobId: typeof analysisJob.id === 'string' ? analysisJob.id : undefined,
      name: input.name ?? exploration.name ?? `AI generated case ${exploration.id}`,
      versionLabel: input.versionLabel ?? 'ai-exploration-v1',
      changeSummary: input.changeSummary ?? 'publish from ai exploration recording',
      publish: input.publish ?? false,
      defaultDataset: Object.keys(exploration.sampleDataset).length > 0
        ? {
          name: input.defaultDatasetName ?? 'ai-exploration-default',
          values: exploration.sampleDataset,
        }
        : undefined,
    });
    const publishedRecord = published as Record<string, unknown>;
    const publishedTestCase = (publishedRecord.test_case ?? {}) as Record<string, unknown>;
    const publishedVersion = (publishedRecord.version ?? {}) as Record<string, unknown>;
    const publishedDefaultDatasetRow = (publishedRecord.default_dataset_row ?? {}) as Record<string, unknown>;

    const updated = await this.#store.updateExploration(explorationId, {
      createdTestCaseId: typeof publishedTestCase.id === 'string' ? publishedTestCase.id : null,
      createdTestCaseVersionId: typeof publishedVersion.id === 'string' ? publishedVersion.id : null,
      defaultDatasetRowId: typeof publishedDefaultDatasetRow.id === 'string' ? publishedDefaultDatasetRow.id : null,
    });
    return {
      exploration: updated,
      analysisJobId: String(analysisJob.id),
      testCaseId: String(publishedTestCase.id),
      versionId: String(publishedVersion.id),
      defaultDatasetRowId: typeof publishedDefaultDatasetRow.id === 'string'
        ? publishedDefaultDatasetRow.id
        : null,
    };
  }

  async browserAssist(explorationId: string, instruction: string): Promise<{ exploration: ExplorationSession; reply: string }> {
    const exploration = await this.#getRequiredExploration(explorationId);
    const result = await this.#browserBroker.runBrowserAssist(exploration, instruction);
    const updated = await this.#store.updateExploration(explorationId, {
      lastSnapshotMarkdown: result.lastSnapshotMarkdown,
      summary: result.reply,
    });
    return {
      exploration: updated,
      reply: result.reply,
    };
  }

  async close(): Promise<void> {
    await this.#browserBroker.close();
  }

  async #getRequiredExploration(explorationId: string): Promise<ExplorationSession> {
    const exploration = await this.#store.getExploration(explorationId);
    if (!exploration) {
      throw new Error(`exploration not found: ${explorationId}`);
    }

    return exploration;
  }
}
