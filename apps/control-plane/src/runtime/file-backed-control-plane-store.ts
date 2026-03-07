import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { InMemoryControlPlaneState } from './control-plane-state.js';
import type {
  ControlPlaneListRunItemsQuery,
  ControlPlaneListRunsQuery,
  ControlPlaneListStepEventsQuery,
  ControlPlaneMigrationRecord,
  ControlPlanePage,
  ControlPlaneRunItemRecord,
  ControlPlaneRunRecord,
  ControlPlaneStateSnapshot,
  ControlPlaneStepEventRecord,
  ControlPlaneStore,
  RecordedRunnerEvent,
  RecordRunnerEventResult,
  RunnerResultEnvelope,
} from '../types.js';
import type { StepControlResponse } from '@aiwtp/web-worker';

interface PersistedControlPlaneStateFile extends ControlPlaneStateSnapshot {
  schemaVersion: '1.0';
}

const defaultState = (): PersistedControlPlaneStateFile => ({
  schemaVersion: '1.0',
  eventsByJob: {},
  pendingDecisionsByJob: {},
  receivedEventIds: [],
});

export interface FileBackedControlPlaneStoreOptions {
  filePath: string;
}

export class FileBackedControlPlaneStore implements ControlPlaneStore {
  private writeChain: Promise<void> = Promise.resolve();

  private constructor(
    private readonly filePath: string,
    private readonly memoryStore: InMemoryControlPlaneState,
  ) {}

  static async open(options: FileBackedControlPlaneStoreOptions): Promise<FileBackedControlPlaneStore> {
    const persisted = await FileBackedControlPlaneStore.readStateFile(options.filePath);
    const memoryStore = new InMemoryControlPlaneState(persisted);
    return new FileBackedControlPlaneStore(options.filePath, memoryStore);
  }

  async recordRunnerEvent(envelope: RunnerResultEnvelope): Promise<RecordRunnerEventResult> {
    const result = await this.memoryStore.recordRunnerEvent(envelope);
    if (!result.duplicate) {
      await this.persist();
    }
    return result;
  }

  async listJobEvents(jobId: string): Promise<RecordedRunnerEvent[]> {
    return this.memoryStore.listJobEvents(jobId);
  }

  async enqueueStepDecision(jobId: string, sourceStepId: string, decision: StepControlResponse): Promise<void> {
    await this.memoryStore.enqueueStepDecision(jobId, sourceStepId, decision);
    await this.persist();
  }

  async dequeueStepDecision(jobId: string, sourceStepId: string): Promise<StepControlResponse | undefined> {
    const decision = await this.memoryStore.dequeueStepDecision(jobId, sourceStepId);
    if (decision) {
      await this.persist();
    }
    return decision;
  }

  async listAppliedMigrations(): Promise<ControlPlaneMigrationRecord[]> {
    return this.memoryStore.listAppliedMigrations();
  }

  async getRun(runId: string): Promise<ControlPlaneRunRecord | undefined> {
    return this.memoryStore.getRun(runId);
  }

  async listRuns(query: ControlPlaneListRunsQuery): Promise<ControlPlanePage<ControlPlaneRunRecord>> {
    return this.memoryStore.listRuns(query);
  }

  async getRunItem(runItemId: string): Promise<ControlPlaneRunItemRecord | undefined> {
    return this.memoryStore.getRunItem(runItemId);
  }

  async listRunItems(query: ControlPlaneListRunItemsQuery): Promise<ControlPlanePage<ControlPlaneRunItemRecord>> {
    return this.memoryStore.listRunItems(query);
  }

  async listStepEventsByRun(runId: string, query: ControlPlaneListStepEventsQuery): Promise<ControlPlanePage<ControlPlaneStepEventRecord>> {
    return this.memoryStore.listStepEventsByRun(runId, query);
  }

  async listStepEventsByRunItem(runItemId: string, query: ControlPlaneListStepEventsQuery): Promise<ControlPlanePage<ControlPlaneStepEventRecord>> {
    return this.memoryStore.listStepEventsByRunItem(runItemId, query);
  }

  async snapshot(): Promise<ControlPlaneStateSnapshot> {
    return this.memoryStore.snapshot();
  }

  async close(): Promise<void> {
    await this.writeChain;
  }

  private async persist(): Promise<void> {
    const snapshot = await this.memoryStore.snapshot();
    const stateFile = {
      schemaVersion: '1.0',
      ...snapshot,
    } satisfies PersistedControlPlaneStateFile;

    this.writeChain = this.writeChain.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      const tempPath = `${this.filePath}.tmp`;
      await writeFile(tempPath, JSON.stringify(stateFile, null, 2), 'utf8');
      await rename(tempPath, this.filePath);
    });

    await this.writeChain;
  }

  private static async readStateFile(filePath: string): Promise<PersistedControlPlaneStateFile> {
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedControlPlaneStateFile>;
      return {
        ...defaultState(),
        ...parsed,
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return defaultState();
      }
      throw error;
    }
  }
}
