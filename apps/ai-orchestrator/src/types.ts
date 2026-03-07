export type AiProviderName = 'google' | 'openai' | 'mock';

export type AssistantMessageRole = 'user' | 'assistant';

export interface AssistantMessage {
  id: string;
  threadId: string;
  role: AssistantMessageRole;
  content: string;
  createdAt: string;
}

export interface AssistantMemoryFact {
  id: string;
  threadId: string;
  content: string;
  confidence: number;
  sourceMessageId: string;
  sourceType: 'user_message';
  createdAt: string;
}

export interface AssistantThread {
  id: string;
  title: string | null;
  tenantId: string | null;
  projectId: string | null;
  userId: string | null;
  graphType: 'assistant';
  messages: AssistantMessage[];
  facts: AssistantMemoryFact[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssistantThreadInput {
  title?: string;
  tenantId?: string;
  projectId?: string;
  userId?: string;
}

export interface AssistantTurnResult {
  assistantMessage: AssistantMessage;
  thread: AssistantThread;
}
