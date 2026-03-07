import type { WebWorkerResult } from '../job-runner/types.js';
import type {
  AgentControlPlaneClient,
  PollingCycleResult,
  PollingWebAgentOptions,
  WorkerAgentDescriptor,
  WorkerJobRunnerLike,
} from './types.js';

const mapWorkerStatusToLeaseStatus = (status: WebWorkerResult['status']): 'succeeded' | 'failed' | 'canceled' => {
  switch (status) {
    case 'executed':
      return 'succeeded';
    case 'compile_failed':
    case 'execution_failed':
      return 'failed';
    case 'compiled':
      return 'failed';
  }
};

export class PollingWebAgent {
  constructor(
    private readonly client: AgentControlPlaneClient,
    private readonly runner: WorkerJobRunnerLike,
    private readonly descriptor: WorkerAgentDescriptor,
    private readonly options: PollingWebAgentOptions = {},
  ) {}

  async runOnce(): Promise<PollingCycleResult> {
    await this.client.registerAgent(this.descriptor);
    await this.client.heartbeatAgent(this.descriptor.agentId, {
      status: this.options.idleHeartbeatStatus ?? 'online',
      capabilities: this.descriptor.capabilities,
      metadata: this.descriptor.metadata,
    });

    const lease = await this.client.acquireLease(this.descriptor.agentId, {
      supportedJobKinds: this.options.supportedJobKinds ?? ['web'],
      leaseTtlSeconds: this.options.leaseTtlSeconds ?? 60,
    });

    if (!lease) {
      return { status: 'idle' };
    }

    await this.client.heartbeatAgent(this.descriptor.agentId, {
      status: this.options.busyHeartbeatStatus ?? 'busy',
      capabilities: this.descriptor.capabilities,
      metadata: this.descriptor.metadata,
    });

    const heartbeatIntervalMs = this.options.leaseHeartbeatIntervalMs ?? 10_000;
    const heartbeatTimer = setInterval(() => {
      void this.client.heartbeatLease(lease.lease.lease_token, {
        leaseTtlSeconds: this.options.leaseTtlSeconds ?? 60,
      }).catch(() => {
        // Best-effort background heartbeat.
      });
    }, heartbeatIntervalMs);

    try {
      const result = await this.runner.run(lease.job);
      await this.client.completeLease(lease.lease.lease_token, {
        status: mapWorkerStatusToLeaseStatus(result.status),
      });
      await this.client.heartbeatAgent(this.descriptor.agentId, {
        status: this.options.idleHeartbeatStatus ?? 'online',
        capabilities: this.descriptor.capabilities,
        metadata: this.descriptor.metadata,
      });
      return {
        status: 'executed',
        jobId: lease.job.jobId,
        runId: lease.job.runId,
        runItemId: lease.job.runItemId,
        leaseToken: lease.lease.lease_token,
        workerStatus: result.status,
      };
    } catch (error) {
      await this.client.completeLease(lease.lease.lease_token, { status: 'failed' });
      await this.client.heartbeatAgent(this.descriptor.agentId, {
        status: 'online',
        capabilities: this.descriptor.capabilities,
        metadata: this.descriptor.metadata,
      });
      throw error;
    } finally {
      clearInterval(heartbeatTimer);
    }
  }

  async runUntilIdle(maxIdleIterations = 1): Promise<PollingCycleResult[]> {
    const results: PollingCycleResult[] = [];
    let idleCount = 0;
    while (idleCount < maxIdleIterations) {
      const cycle = await this.runOnce();
      results.push(cycle);
      if (cycle.status === 'idle') {
        idleCount += 1;
      } else {
        idleCount = 0;
      }
    }

    return results;
  }
}
