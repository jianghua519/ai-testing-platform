import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';

import type { AssistantMessage, AiProviderName } from '../types.js';
import type { AiOrchestratorConfig } from './config.js';

export interface ProviderRequest {
  memoryFacts: string[];
  messages: AssistantMessage[];
  systemPrompt: string;
}

export interface AiChatProvider {
  readonly model: string;
  readonly name: AiProviderName;
  invoke(request: ProviderRequest): Promise<string>;
}

const normalizeResponseContent = (content: unknown): string => {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
          return part.text;
        }

        return JSON.stringify(part);
      })
      .join('\n')
      .trim();
  }

  return String(content ?? '').trim();
};

const buildLangChainMessages = (request: ProviderRequest) => {
  const history = request.messages.map((message) => (
    message.role === 'assistant'
      ? new AIMessage(message.content)
      : new HumanMessage(message.content)
  ));

  return [
    new SystemMessage(request.systemPrompt),
    ...history,
  ];
};

class GoogleAiChatProvider implements AiChatProvider {
  readonly name = 'google' as const;
  readonly model: string;
  readonly #client: ChatGoogleGenerativeAI;

  constructor(config: AiOrchestratorConfig) {
    if (!config.googleApiKey) {
      throw new Error('GOOGLE_API_KEY is required when AI_PROVIDER=google');
    }

    this.model = config.googleModel;
    this.#client = new ChatGoogleGenerativeAI({
      apiKey: config.googleApiKey,
      model: config.googleModel,
      temperature: config.temperature,
    });
  }

  async invoke(request: ProviderRequest): Promise<string> {
    const response = await this.#client.invoke(buildLangChainMessages(request));
    return normalizeResponseContent(response.content);
  }
}

class OpenAiChatProvider implements AiChatProvider {
  readonly name = 'openai' as const;
  readonly model: string;
  readonly #client: ChatOpenAI;

  constructor(config: AiOrchestratorConfig) {
    if (!config.openaiApiKey) {
      throw new Error('OPENAI_API_KEY is required when AI_PROVIDER=openai');
    }

    this.model = config.openaiModel;
    this.#client = new ChatOpenAI({
      apiKey: config.openaiApiKey,
      configuration: config.openaiBaseUrl ? { baseURL: config.openaiBaseUrl } : undefined,
      model: config.openaiModel,
      temperature: config.temperature,
    });
  }

  async invoke(request: ProviderRequest): Promise<string> {
    const response = await this.#client.invoke(buildLangChainMessages(request));
    return normalizeResponseContent(response.content);
  }
}

class MockAiChatProvider implements AiChatProvider {
  readonly name = 'mock' as const;
  readonly model = 'mock-deterministic';

  async invoke(request: ProviderRequest): Promise<string> {
    const latestMessage = [...request.messages].reverse().find((message) => message.role === 'user');
    const latestInput = latestMessage?.content ?? '';
    const lower = latestInput.toLowerCase();

    if (lower.includes('你记得什么') || lower.includes('what do you remember')) {
      if (request.memoryFacts.length === 0) {
        return '我暂时还没有记住任何事实。';
      }

      return `我记得：${request.memoryFacts.join('；')}`;
    }

    if (lower.includes('记住') || lower.includes('remember')) {
      if (request.memoryFacts.length === 0) {
        return '我收到消息了，但这次没有提取出可记忆的事实。';
      }

      return `已记住：${request.memoryFacts[request.memoryFacts.length - 1]}`;
    }

    return `mock(${this.model}) 收到：${latestInput}`;
  }
}

export const createAiChatProvider = (config: AiOrchestratorConfig): AiChatProvider => {
  if (config.provider === 'google') {
    return new GoogleAiChatProvider(config);
  }

  if (config.provider === 'openai') {
    return new OpenAiChatProvider(config);
  }

  return new MockAiChatProvider();
};
