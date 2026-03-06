import type { ExecutionClock } from '../types.js';

export class SystemExecutionClock implements ExecutionClock {
  now(): Date {
    return new Date();
  }
}
