import { signControlPlaneJwt } from '@aiwtp/control-plane';

import type { AiOrchestratorConfig } from './config.js';

export interface ControlPlaneActor {
  subjectId: string;
  tenantId: string;
}

export interface ControlPlaneRecordingEventInput {
  event_type: string;
  page_url?: string;
  locator?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  captured_at?: string;
}

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  actor?: ControlPlaneActor;
}

const readJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  return text.trim() ? JSON.parse(text) : null;
};

export class ControlPlaneClient {
  readonly #baseUrl: string;
  readonly #jwtSecret: string;

  constructor(config: AiOrchestratorConfig) {
    this.#baseUrl = config.controlPlaneBaseUrl;
    this.#jwtSecret = config.controlPlaneJwtSecret;
  }

  async createRecording(
    actor: ControlPlaneActor,
    payload: {
      tenantId: string;
      projectId: string;
      name: string;
      sourceType: 'manual' | 'auto_explore' | 'run_replay';
      envProfile: Record<string, unknown>;
    },
  ): Promise<Record<string, unknown>> {
    return this.#request('/api/v1/recordings', {
      method: 'POST',
      actor,
      body: {
        tenant_id: payload.tenantId,
        project_id: payload.projectId,
        name: payload.name,
        source_type: payload.sourceType,
        env_profile: payload.envProfile,
      },
    }) as Promise<Record<string, unknown>>;
  }

  async appendRecordingEvents(
    actor: ControlPlaneActor,
    recordingId: string,
    events: ControlPlaneRecordingEventInput[],
  ): Promise<Record<string, unknown>> {
    return this.#request(`/api/v1/recordings/${encodeURIComponent(recordingId)}/events`, {
      method: 'POST',
      actor,
      body: {
        events,
      },
    }) as Promise<Record<string, unknown>>;
  }

  async analyzeRecording(actor: ControlPlaneActor, recordingId: string): Promise<Record<string, unknown>> {
    return this.#request(`/api/v1/recordings/${encodeURIComponent(recordingId)}:analyze-dsl`, {
      method: 'POST',
      actor,
      body: {},
    }) as Promise<Record<string, unknown>>;
  }

  async publishRecordingAsTestCase(
    actor: ControlPlaneActor,
    recordingId: string,
    payload: {
      analysisJobId?: string;
      name?: string;
      versionLabel?: string;
      changeSummary?: string;
      publish?: boolean;
      defaultDataset?: {
        name?: string;
        values?: Record<string, unknown>;
      };
    },
  ): Promise<Record<string, unknown>> {
    return this.#request(`/api/v1/recordings/${encodeURIComponent(recordingId)}:publish-test-case`, {
      method: 'POST',
      actor,
      body: {
        analysis_job_id: payload.analysisJobId,
        name: payload.name,
        version_label: payload.versionLabel,
        change_summary: payload.changeSummary,
        publish: payload.publish,
        default_dataset: payload.defaultDataset,
      },
    }) as Promise<Record<string, unknown>>;
  }

  async getRun(actor: ControlPlaneActor, runId: string): Promise<Record<string, unknown>> {
    return this.#request(`/api/v1/runs/${encodeURIComponent(runId)}`, {
      method: 'GET',
      actor,
    }) as Promise<Record<string, unknown>>;
  }

  async getRunItem(actor: ControlPlaneActor, runItemId: string): Promise<Record<string, unknown>> {
    return this.#request(`/api/v1/run-items/${encodeURIComponent(runItemId)}`, {
      method: 'GET',
      actor,
    }) as Promise<Record<string, unknown>>;
  }

  async listRunItems(actor: ControlPlaneActor, runId: string): Promise<Record<string, unknown>[]> {
    const result = await this.#request(`/api/v1/run-items?run_id=${encodeURIComponent(runId)}&limit=50`, {
      method: 'GET',
      actor,
    }) as Record<string, unknown>;
    return Array.isArray(result.items) ? result.items as Record<string, unknown>[] : [];
  }

  async listRunItemStepEvents(runItemId: string): Promise<Record<string, unknown>[]> {
    const result = await this.#request(`/api/v1/internal/run-items/${encodeURIComponent(runItemId)}/step-events?limit=200`, {
      method: 'GET',
    }) as Record<string, unknown>;
    return Array.isArray(result.items) ? result.items as Record<string, unknown>[] : [];
  }

  async listRunItemArtifacts(runItemId: string): Promise<Record<string, unknown>[]> {
    const result = await this.#request(`/api/v1/internal/run-items/${encodeURIComponent(runItemId)}/artifacts?limit=200`, {
      method: 'GET',
    }) as Record<string, unknown>;
    return Array.isArray(result.items) ? result.items as Record<string, unknown>[] : [];
  }

  async getTestCaseVersion(actor: ControlPlaneActor, testCaseVersionId: string): Promise<Record<string, unknown>> {
    return this.#request(`/api/v1/test-case-versions/${encodeURIComponent(testCaseVersionId)}`, {
      method: 'GET',
      actor,
    }) as Promise<Record<string, unknown>>;
  }

  async listTestCaseVersions(actor: ControlPlaneActor, testCaseId: string): Promise<Record<string, unknown>[]> {
    const result = await this.#request(`/api/v1/test-cases/${encodeURIComponent(testCaseId)}/versions?limit=50`, {
      method: 'GET',
      actor,
    }) as Record<string, unknown>;
    return Array.isArray(result.items) ? result.items as Record<string, unknown>[] : [];
  }

  async createTestCaseVersion(
    actor: ControlPlaneActor,
    testCaseId: string,
    payload: {
      plan: Record<string, unknown>;
      envProfile: Record<string, unknown>;
      versionLabel?: string;
      changeSummary?: string;
      publish?: boolean;
      defaultDataset?: {
        name?: string;
        values?: Record<string, unknown>;
      };
    },
  ): Promise<Record<string, unknown>> {
    return this.#request(`/api/v1/test-cases/${encodeURIComponent(testCaseId)}/versions`, {
      method: 'POST',
      actor,
      body: {
        plan: payload.plan,
        env_profile: payload.envProfile,
        version_label: payload.versionLabel,
        change_summary: payload.changeSummary,
        publish: payload.publish,
        default_dataset: payload.defaultDataset,
      },
    }) as Promise<Record<string, unknown>>;
  }

  async createRun(
    actor: ControlPlaneActor,
    payload: {
      tenantId: string;
      projectId: string;
      name: string;
      mode: 'standard' | 'intelligent';
      selection: Record<string, unknown>;
      executionPolicy?: Record<string, unknown>;
    },
  ): Promise<Record<string, unknown>> {
    return this.#request('/api/v1/runs', {
      method: 'POST',
      actor,
      body: {
        tenant_id: payload.tenantId,
        project_id: payload.projectId,
        name: payload.name,
        mode: payload.mode,
        selection: payload.selection,
        execution_policy: payload.executionPolicy,
      },
    }) as Promise<Record<string, unknown>>;
  }

  async enqueueStepOverride(
    jobId: string,
    sourceStepId: string,
    payload: {
      action: 'execute' | 'skip' | 'replace' | 'pause' | 'cancel';
      reason?: string;
      replacementStep?: Record<string, unknown>;
      tenantId?: string;
      runId?: string;
      runItemId?: string;
    },
  ): Promise<Record<string, unknown>> {
    return this.#request(`/api/v1/internal/jobs/${encodeURIComponent(jobId)}/steps/${encodeURIComponent(sourceStepId)}:override`, {
      method: 'POST',
      body: {
        action: payload.action,
        reason: payload.reason,
        replacement_step: payload.replacementStep,
        tenant_id: payload.tenantId,
        run_id: payload.runId,
        run_item_id: payload.runItemId,
      },
    }) as Promise<Record<string, unknown>>;
  }

  async extractTestCaseFromRunItem(
    actor: ControlPlaneActor,
    runItemId: string,
    payload: {
      versionLabel?: string;
      changeSummary?: string;
      publish?: boolean;
      defaultDatasetName?: string;
    },
  ): Promise<Record<string, unknown>> {
    return this.#request(`/api/v1/run-items/${encodeURIComponent(runItemId)}:extract-test-case`, {
      method: 'POST',
      actor,
      body: {
        version_label: payload.versionLabel,
        change_summary: payload.changeSummary,
        publish: payload.publish,
        default_dataset_name: payload.defaultDatasetName,
      },
    }) as Promise<Record<string, unknown>>;
  }

  async #request(pathname: string, options: FetchOptions): Promise<unknown> {
    const response = await fetch(new URL(pathname, this.#baseUrl), {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body == null ? {} : { 'content-type': 'application/json' }),
        ...(options.actor ? { authorization: this.#signActor(options.actor) } : {}),
      },
      body: options.body == null ? undefined : JSON.stringify(options.body),
    });
    const body = await readJson(response);

    if (!response.ok) {
      const message = typeof body === 'object' && body && 'error' in body
        ? JSON.stringify((body as Record<string, unknown>).error)
        : `control-plane request failed: ${response.status}`;
      throw new Error(message);
    }

    return body;
  }

  #signActor(actor: ControlPlaneActor): string {
    return `Bearer ${signControlPlaneJwt({
      sub: actor.subjectId,
      tenant_id: actor.tenantId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }, {
      CONTROL_PLANE_JWT_SECRET: this.#jwtSecret,
    })}`;
  }
}
