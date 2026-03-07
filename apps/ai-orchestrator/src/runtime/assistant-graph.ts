import { END, START, StateGraph } from '@langchain/langgraph';

import type { AssistantMessage, AssistantThread, AssistantTurnResult } from '../types.js';
import type { AiOrchestratorConfig } from './config.js';
import type { AiChatProvider } from './providers.js';
import type { AssistantThreadStore } from './thread-store.js';

interface AssistantTurnState {
  threadId: string;
  userInput: string;
  thread: AssistantThread | null;
  userMessage: AssistantMessage | null;
  extractedFacts: string[];
  reply: string | null;
}

const createAssistantStateGraph = () => new StateGraph<AssistantTurnState>({
  channels: {
    threadId: null,
    userInput: null,
    thread: null,
    userMessage: null,
    extractedFacts: {
      default: () => [],
      reducer: (_current, update) => update,
    },
    reply: null,
  },
});

const normalizeFact = (value: string): string => value.trim().replace(/^[\s:：,，.\-]+/, '').replace(/[。！!]+$/, '');

const extractRememberedFacts = (input: string): string[] => {
  const trimmed = input.trim();
  if (!trimmed) {
    return [];
  }

  const patterns = [
    /^(?:请)?记住[：:\s]*(.+)$/i,
    /^remember[：:\s]*(.+)$/i,
    /^please remember[：:\s]*(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (!match) {
      continue;
    }

    const fact = normalizeFact(match[1] ?? '');
    return fact ? [fact] : [];
  }

  return [];
};

const buildSystemPrompt = (config: AiOrchestratorConfig, memoryFacts: string[]): string => {
  const factsBlock = memoryFacts.length > 0
    ? memoryFacts.map((fact) => `- ${fact}`).join('\n')
    : '- 暂无记忆';

  return [
    '你是 AI Web Testing Platform 的编排助手。',
    '回答必须优先基于当前记忆和用户消息；如果没有足够事实，就明确说明。',
    '当前阶段已经实现 assistant thread / memory / chat API，浏览器探索、自愈和结果分析后续再接入。',
    `当前控制面地址：${config.controlPlaneBaseUrl}`,
    `当前模型提供方：${config.provider}`,
    '当前记忆：',
    factsBlock,
  ].join('\n');
};

export class AssistantGraphRuntime {
  readonly #compiledGraph;
  readonly #config: AiOrchestratorConfig;
  readonly #provider: AiChatProvider;
  readonly #threadStore: AssistantThreadStore;

  constructor(options: {
    config: AiOrchestratorConfig;
    provider: AiChatProvider;
    threadStore: AssistantThreadStore;
  }) {
    this.#config = options.config;
    this.#provider = options.provider;
    this.#threadStore = options.threadStore;

    this.#compiledGraph = createAssistantStateGraph()
      .addNode('loadThread', async (state) => {
        const thread = await this.#threadStore.getThread(state.threadId);
        if (!thread) {
          throw new Error(`assistant thread not found: ${state.threadId}`);
        }

        return { thread };
      })
      .addNode('persistUserMessage', async (state) => {
        const userMessage = await this.#threadStore.appendMessage(state.threadId, 'user', state.userInput);
        const thread = await this.#threadStore.getThread(state.threadId);
        if (!thread) {
          throw new Error(`assistant thread not found after user message append: ${state.threadId}`);
        }

        return { thread, userMessage };
      })
      .addNode('extractMemory', async (state) => {
        const userMessage = state.userMessage;
        if (!userMessage) {
          return { extractedFacts: [] };
        }

        const extractedFacts = extractRememberedFacts(userMessage.content);
        if (extractedFacts.length > 0) {
          await this.#threadStore.rememberFacts(state.threadId, userMessage.id, extractedFacts);
        }

        return { extractedFacts, thread: await this.#threadStore.getThread(state.threadId) };
      })
      .addNode('callModel', async (state) => {
        const thread = await this.#threadStore.getThread(state.threadId);
        if (!thread) {
          throw new Error(`assistant thread not found before model call: ${state.threadId}`);
        }

        const reply = await this.#provider.invoke({
          memoryFacts: thread.facts.map((fact) => fact.content),
          messages: thread.messages,
          systemPrompt: buildSystemPrompt(this.#config, thread.facts.map((fact) => fact.content)),
        });

        return { reply, thread };
      })
      .addNode('persistAssistantMessage', async (state) => {
        if (!state.reply) {
          throw new Error('assistant reply is empty');
        }

        await this.#threadStore.appendMessage(state.threadId, 'assistant', state.reply);
        const thread = await this.#threadStore.getThread(state.threadId);
        if (!thread) {
          throw new Error(`assistant thread not found after assistant message append: ${state.threadId}`);
        }

        return { thread };
      })
      .addEdge(START, 'loadThread')
      .addEdge('loadThread', 'persistUserMessage')
      .addEdge('persistUserMessage', 'extractMemory')
      .addEdge('extractMemory', 'callModel')
      .addEdge('callModel', 'persistAssistantMessage')
      .addEdge('persistAssistantMessage', END)
      .compile();
  }

  async runTurn(threadId: string, userInput: string): Promise<AssistantTurnResult> {
    const result = await this.#compiledGraph.invoke({
      threadId,
      userInput,
      thread: null,
      userMessage: null,
      extractedFacts: [],
      reply: null,
    });

    const thread = await this.#threadStore.getThread(threadId);
    if (!thread) {
      throw new Error(`assistant thread not found after graph invoke: ${threadId}`);
    }

    const assistantMessage = [...thread.messages].reverse().find((message) => message.role === 'assistant');
    if (!assistantMessage) {
      throw new Error(`assistant message missing after graph invoke: ${threadId}`);
    }

    if (result.thread == null) {
      throw new Error(`assistant graph result is missing thread state: ${threadId}`);
    }

    return {
      assistantMessage,
      thread,
    };
  }
}
