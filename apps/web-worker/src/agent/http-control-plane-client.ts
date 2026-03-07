import type {
  AcquireLeaseInput,
  AcquiredWorkerLease,
  AgentControlPlaneClient,
  AgentHeartbeatInput,
  CompleteLeaseInput,
  LeaseHeartbeatInput,
  WorkerAgentDescriptor,
  WorkerAgentRecord,
  WorkerLeaseRecord,
} from './types.js';

export interface HttpAgentControlPlaneClientOptions {
  baseUrl: string;
  authToken?: string;
  timeoutMs?: number;
  additionalHeaders?: Record<string, string>;
}

const buildHeaders = (options: HttpAgentControlPlaneClientOptions): HeadersInit => ({
  'content-type': 'application/json',
  ...(options.authToken ? { authorization: `Bearer ${options.authToken}` } : {}),
  ...(options.additionalHeaders ?? {}),
});

const parseJsonResponse = async <T>(response: Response): Promise<T | undefined> => {
  if (response.status === 204) {
    return undefined;
  }

  const text = await response.text();
  return text ? JSON.parse(text) as T : undefined;
};

export class HttpAgentControlPlaneClient implements AgentControlPlaneClient {
  constructor(private readonly options: HttpAgentControlPlaneClientOptions) {}

  async registerAgent(descriptor: WorkerAgentDescriptor): Promise<WorkerAgentRecord> {
    return this.postJson<WorkerAgentRecord>('/api/v1/internal/agents:register', {
      agent_id: descriptor.agentId,
      tenant_id: descriptor.tenantId,
      project_id: descriptor.projectId,
      name: descriptor.name,
      platform: descriptor.platform,
      architecture: descriptor.architecture,
      runtime_kind: descriptor.runtimeKind,
      capabilities: descriptor.capabilities,
      metadata: descriptor.metadata ?? {},
      max_parallel_slots: descriptor.maxParallelSlots,
    });
  }

  async heartbeatAgent(agentId: string, input: AgentHeartbeatInput): Promise<WorkerAgentRecord> {
    return this.postJson<WorkerAgentRecord>(`/api/v1/internal/agents/${agentId}:heartbeat`, {
      status: input.status,
      capabilities: input.capabilities,
      metadata: input.metadata,
      max_parallel_slots: input.maxParallelSlots,
    });
  }

  async acquireLease(agentId: string, input: AcquireLeaseInput): Promise<AcquiredWorkerLease | undefined> {
    return this.postJson<AcquiredWorkerLease | undefined>(`/api/v1/internal/agents/${agentId}:acquire-lease`, {
      supported_job_kinds: input.supportedJobKinds,
      lease_ttl_seconds: input.leaseTtlSeconds,
    }, true);
  }

  async heartbeatLease(leaseToken: string, input: LeaseHeartbeatInput): Promise<WorkerLeaseRecord> {
    return this.postJson<WorkerLeaseRecord>(`/api/v1/internal/leases/${leaseToken}:heartbeat`, {
      lease_ttl_seconds: input.leaseTtlSeconds,
    });
  }

  async completeLease(leaseToken: string, input: CompleteLeaseInput): Promise<WorkerLeaseRecord> {
    return this.postJson<WorkerLeaseRecord>(`/api/v1/internal/leases/${leaseToken}:complete`, input);
  }

  private async postJson<T>(pathname: string, payload: unknown, allowNoContent = false): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 5000);
    try {
      const response = await fetch(new URL(pathname, this.options.baseUrl), {
        method: 'POST',
        headers: buildHeaders(this.options),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok && !(allowNoContent && response.status === 204)) {
        const text = await response.text();
        throw new Error(`control-plane request failed: ${response.status} ${response.statusText} ${text}`.trim());
      }

      return await parseJsonResponse<T>(response) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
