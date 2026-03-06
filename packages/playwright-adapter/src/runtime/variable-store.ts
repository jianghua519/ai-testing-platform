import type { RuntimeVariableStore } from '../types.js';

export class MemoryRuntimeVariableStore implements RuntimeVariableStore {
  constructor(private readonly values: Record<string, unknown> = {}) {}

  get(name: string): unknown {
    return this.values[name];
  }

  set(name: string, value: unknown): void {
    this.values[name] = value;
  }

  snapshot(): Record<string, unknown> {
    return { ...this.values };
  }

  resolve(ref?: string): unknown {
    if (!ref) {
      return undefined;
    }
    return this.values[ref];
  }
}
