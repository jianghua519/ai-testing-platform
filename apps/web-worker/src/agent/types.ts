import type { WebWorkerJob, WebWorkerResult } from '../job-runner/types.js';

export interface WorkerAgentDescriptor {
  agentId: string;
  tenantId: string;
  projectId?: string;
  name: string;
  platform: string;
  architecture: string;
  runtimeKind: string;
  capabilities: string[];
  metadata?: Record<string, unknown>;
}

export interface WorkerAgentRecord {
  agent_id: string;
  tenant_id: string;
  project_id: string | null;
  name: string;
  platform: string;
  architecture: string;
  runtime_kind: string;
  status: string;
  capabilities: string[];
  metadata: Record<string, unknown>;
  last_heartbeat_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkerLeaseRecord {
  lease_id: number;
  lease_token: string;
  job_id: string;
  run_id: string;
  run_item_id: string;
  agent_id: string;
  attempt_no: number;
  status: string;
  acquired_at: string;
  expires_at: string;
  heartbeat_at: string | null;
  released_at: string | null;
}

export interface AcquiredWorkerLease {
  lease: WorkerLeaseRecord;
  job: WebWorkerJob;
}

export interface AgentHeartbeatInput {
  status?: string;
  capabilities?: string[];
  metadata?: Record<string, unknown>;
}

export interface AcquireLeaseInput {
  supportedJobKinds: string[];
  leaseTtlSeconds: number;
}

export interface LeaseHeartbeatInput {
  leaseTtlSeconds: number;
}

export interface CompleteLeaseInput {
  status: 'succeeded' | 'failed' | 'canceled';
}

export interface AgentControlPlaneClient {
  registerAgent(descriptor: WorkerAgentDescriptor): Promise<WorkerAgentRecord>;
  heartbeatAgent(agentId: string, input: AgentHeartbeatInput): Promise<WorkerAgentRecord>;
  acquireLease(agentId: string, input: AcquireLeaseInput): Promise<AcquiredWorkerLease | undefined>;
  heartbeatLease(leaseToken: string, input: LeaseHeartbeatInput): Promise<WorkerLeaseRecord>;
  completeLease(leaseToken: string, input: CompleteLeaseInput): Promise<WorkerLeaseRecord>;
}

export interface WorkerJobRunnerLike {
  run(job: WebWorkerJob): Promise<WebWorkerResult>;
}

export interface PollingWebAgentOptions {
  supportedJobKinds?: string[];
  leaseTtlSeconds?: number;
  leaseHeartbeatIntervalMs?: number;
  idleHeartbeatStatus?: string;
  busyHeartbeatStatus?: string;
}

export interface PollingCycleResult {
  status: 'idle' | 'executed';
  jobId?: string;
  runId?: string;
  runItemId?: string;
  leaseToken?: string;
  workerStatus?: WebWorkerResult['status'];
}
