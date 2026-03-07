import { randomUUID } from 'node:crypto';

import type {
  AssistantMemoryFact,
  AssistantMessage,
  AssistantMessageRole,
  AssistantThread,
  CreateAssistantThreadInput,
} from '../types.js';
import type { AiOrchestratorConfig } from './config.js';
import { PostgresAssistantThreadStore } from './postgres-thread-store.js';

const clone = <T>(value: T): T => structuredClone(value);

export interface AssistantThreadStore {
  readonly mode: 'memory' | 'postgres';
  createThread(input?: CreateAssistantThreadInput): Promise<AssistantThread>;
  getThread(threadId: string): Promise<AssistantThread | null>;
  appendMessage(threadId: string, role: AssistantMessageRole, content: string): Promise<AssistantMessage>;
  rememberFacts(threadId: string, sourceMessageId: string, factContents: string[]): Promise<AssistantMemoryFact[]>;
  close(): Promise<void>;
}

export class InMemoryAssistantThreadStore implements AssistantThreadStore {
  readonly mode = 'memory' as const;
  readonly #threads = new Map<string, AssistantThread>();
  readonly #maxFacts: number;

  constructor(options?: { maxFacts?: number }) {
    this.#maxFacts = options?.maxFacts ?? 32;
  }

  async createThread(input: CreateAssistantThreadInput = {}): Promise<AssistantThread> {
    const timestamp = new Date().toISOString();
    const thread: AssistantThread = {
      id: randomUUID(),
      title: input.title?.trim() || null,
      tenantId: input.tenantId?.trim() || null,
      projectId: input.projectId?.trim() || null,
      userId: input.userId?.trim() || null,
      graphType: 'assistant',
      messages: [],
      facts: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.#threads.set(thread.id, thread);
    return clone(thread);
  }

  async getThread(threadId: string): Promise<AssistantThread | null> {
    const thread = this.#threads.get(threadId);
    return thread ? clone(thread) : null;
  }

  async appendMessage(threadId: string, role: AssistantMessageRole, content: string): Promise<AssistantMessage> {
    const thread = this.#getMutableThread(threadId);
    const message: AssistantMessage = {
      id: randomUUID(),
      threadId,
      role,
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };

    thread.messages.push(message);
    thread.updatedAt = message.createdAt;
    return clone(message);
  }

  async rememberFacts(threadId: string, sourceMessageId: string, factContents: string[]): Promise<AssistantMemoryFact[]> {
    const thread = this.#getMutableThread(threadId);
    const createdFacts: AssistantMemoryFact[] = [];

    for (const rawFact of factContents) {
      const content = rawFact.trim();
      if (!content) {
        continue;
      }

      const existingIndex = thread.facts.findIndex((fact) => fact.content === content);
      if (existingIndex >= 0) {
        thread.facts[existingIndex] = {
          ...thread.facts[existingIndex],
          sourceMessageId,
          confidence: 0.7,
          createdAt: new Date().toISOString(),
        };
        createdFacts.push(clone(thread.facts[existingIndex]));
        continue;
      }

      const fact: AssistantMemoryFact = {
        id: randomUUID(),
        threadId,
        content,
        confidence: 0.7,
        sourceMessageId,
        sourceType: 'user_message',
        createdAt: new Date().toISOString(),
      };

      thread.facts.push(fact);
      createdFacts.push(clone(fact));
    }

    if (thread.facts.length > this.#maxFacts) {
      thread.facts.splice(0, thread.facts.length - this.#maxFacts);
    }

    thread.updatedAt = new Date().toISOString();
    return createdFacts;
  }

  async close(): Promise<void> {}

  #getMutableThread(threadId: string): AssistantThread {
    const thread = this.#threads.get(threadId);
    if (!thread) {
      throw new Error(`assistant thread not found: ${threadId}`);
    }

    return thread;
  }
}

export const createAssistantThreadStore = async (config: AiOrchestratorConfig): Promise<AssistantThreadStore> => {
  if (config.storeMode === 'postgres') {
    const store = new PostgresAssistantThreadStore(config);
    await store.initialize();
    return store;
  }

  return new InMemoryAssistantThreadStore({ maxFacts: config.memoryMaxFacts });
};
