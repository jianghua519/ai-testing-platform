import type { ControlPlaneStateSnapshot, ControlPlaneStore, RecordedRunnerEvent, RunnerResultEnvelope } from '../types.js';
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

const toNestedMap = <T>(source: Record<string, Record<string, T[]>>): Map<string, Map<string, T[]>> => {
  const target = new Map<string, Map<string, T[]>>();
  for (const [firstKey, nestedRecord] of Object.entries(source)) {
    const nestedMap = new Map<string, T[]>();
    for (const [secondKey, values] of Object.entries(nestedRecord)) {
      nestedMap.set(secondKey, [...values]);
    }
    target.set(firstKey, nestedMap);
  }
  return target;
};

export class InMemoryControlPlaneState implements ControlPlaneStore {
  private readonly eventsByJob: Map<string, RecordedRunnerEvent[]>;
  private readonly pendingDecisionsByJob: Map<string, Map<string, StepControlResponse[]>>;
  private readonly receivedEventIds: Set<string>;

  constructor(snapshot?: ControlPlaneStateSnapshot) {
    this.eventsByJob = new Map<string, RecordedRunnerEvent[]>(
      Object.entries(snapshot?.eventsByJob ?? {}).map(([jobId, items]) => [jobId, [...items]]),
    );
    this.pendingDecisionsByJob = toNestedMap(snapshot?.pendingDecisionsByJob ?? {});
    this.receivedEventIds = new Set(snapshot?.receivedEventIds ?? []);
  }

  async recordRunnerEvent(envelope: RunnerResultEnvelope): Promise<{ duplicate: boolean }> {
    if (this.receivedEventIds.has(envelope.event_id)) {
      return { duplicate: true };
    }

    this.receivedEventIds.add(envelope.event_id);
    const jobId = envelope.payload.job_id;
    const events = this.eventsByJob.get(jobId) ?? [];
    events.push({
      receivedAt: new Date().toISOString(),
      envelope,
    });
    this.eventsByJob.set(jobId, events);
    return { duplicate: false };
  }

  async listJobEvents(jobId: string): Promise<RecordedRunnerEvent[]> {
    return [...(this.eventsByJob.get(jobId) ?? [])];
  }

  async enqueueStepDecision(jobId: string, sourceStepId: string, decision: StepControlResponse): Promise<void> {
    const byStep = this.pendingDecisionsByJob.get(jobId) ?? new Map<string, StepControlResponse[]>();
    const queue = byStep.get(sourceStepId) ?? [];
    queue.push(decision);
    byStep.set(sourceStepId, queue);
    this.pendingDecisionsByJob.set(jobId, byStep);
  }

  async dequeueStepDecision(jobId: string, sourceStepId: string): Promise<StepControlResponse | undefined> {
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

  async snapshot(): Promise<ControlPlaneStateSnapshot> {
    return {
      eventsByJob: Object.fromEntries(Array.from(this.eventsByJob.entries()).map(([jobId, items]) => [jobId, [...items]])),
      pendingDecisionsByJob: toNestedRecord(this.pendingDecisionsByJob),
      receivedEventIds: [...this.receivedEventIds],
    };
  }
}
