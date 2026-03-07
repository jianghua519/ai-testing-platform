import type { RunnerResultEnvelope, RecordedRunnerEvent, InMemoryControlPlaneStateSnapshot } from '../types.js';
import type { StepControlResponse } from '@aiwtp/web-worker';

const toNestedRecord = <T>(source: Map<string, Map<string, T[]>>): Record<string, Record<string, T[]>> => {
  const target: Record<string, Record<string, T[]>> = {};
  for (const [firstKey, nested] of source) {
    target[firstKey] = {};
    for (const [secondKey, values] of nested) {
      target[firstKey][secondKey] = [...values];
    }
  }
  return target;
};

export class InMemoryControlPlaneState {
  private readonly eventsByJob = new Map<string, RecordedRunnerEvent[]>();
  private readonly pendingDecisionsByJob = new Map<string, Map<string, StepControlResponse[]>>();

  recordRunnerEvent(envelope: RunnerResultEnvelope): void {
    const jobId = envelope.payload.job_id;
    const events = this.eventsByJob.get(jobId) ?? [];
    events.push({
      receivedAt: new Date().toISOString(),
      envelope,
    });
    this.eventsByJob.set(jobId, events);
  }

  listJobEvents(jobId: string): RecordedRunnerEvent[] {
    return [...(this.eventsByJob.get(jobId) ?? [])];
  }

  enqueueStepDecision(jobId: string, sourceStepId: string, decision: StepControlResponse): void {
    const byStep = this.pendingDecisionsByJob.get(jobId) ?? new Map<string, StepControlResponse[]>();
    const queue = byStep.get(sourceStepId) ?? [];
    queue.push(decision);
    byStep.set(sourceStepId, queue);
    this.pendingDecisionsByJob.set(jobId, byStep);
  }

  dequeueStepDecision(jobId: string, sourceStepId: string): StepControlResponse | undefined {
    const byStep = this.pendingDecisionsByJob.get(jobId);
    if (!byStep) {
      return undefined;
    }

    const queue = byStep.get(sourceStepId);
    if (!queue || queue.length === 0) {
      return undefined;
    }

    const decision = queue.shift();
    if (queue.length === 0) {
      byStep.delete(sourceStepId);
    }
    if (byStep.size === 0) {
      this.pendingDecisionsByJob.delete(jobId);
    }

    return decision;
  }

  snapshot(): InMemoryControlPlaneStateSnapshot {
    return {
      eventsByJob: Object.fromEntries(Array.from(this.eventsByJob.entries()).map(([jobId, items]) => [jobId, [...items]])),
      pendingDecisionsByJob: toNestedRecord(this.pendingDecisionsByJob),
    };
  }
}
