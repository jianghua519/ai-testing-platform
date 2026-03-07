import { randomUUID } from 'node:crypto';

import type {
  AssistantMemoryFact,
  AssistantMessage,
  AssistantMessageRole,
  AssistantThread,
  CreateAssistantThreadInput,
} from '../types.js';

const clone = <T>(value: T): T => structuredClone(value);

export class InMemoryAssistantThreadStore {
  readonly #threads = new Map<string, AssistantThread>();
  readonly #maxFacts: number;

  constructor(options?: { maxFacts?: number }) {
    this.#maxFacts = options?.maxFacts ?? 32;
  }

  createThread(input: CreateAssistantThreadInput = {}): AssistantThread {
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

  getThread(threadId: string): AssistantThread | null {
    const thread = this.#threads.get(threadId);
    return thread ? clone(thread) : null;
  }

  appendMessage(threadId: string, role: AssistantMessageRole, content: string): AssistantMessage {
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

  rememberFacts(threadId: string, sourceMessageId: string, factContents: string[]): AssistantMemoryFact[] {
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

  #getMutableThread(threadId: string): AssistantThread {
    const thread = this.#threads.get(threadId);
    if (!thread) {
      throw new Error(`assistant thread not found: ${threadId}`);
    }

    return thread;
  }
}
