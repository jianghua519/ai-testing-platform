import http from 'node:http';

import type { AssistantThread, CreateAssistantThreadInput } from '../types.js';
import { AssistantGraphRuntime } from './assistant-graph.js';
import type { AiOrchestratorConfig } from './config.js';
import { loadAiOrchestratorConfig } from './config.js';
import { createAiChatProvider } from './providers.js';
import { createAssistantThreadStore } from './thread-store.js';

class HttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const sendJson = (response: http.ServerResponse, statusCode: number, body: unknown): void => {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body, null, 2));
};

const readJsonBody = async (request: http.IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new HttpError(400, `invalid json body: ${(error as Error).message}`);
  }
};

const asCreateThreadInput = (body: unknown): CreateAssistantThreadInput => {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'thread payload must be an object');
  }

  const raw = body as Record<string, unknown>;
  for (const key of ['title', 'tenantId', 'projectId', 'userId']) {
    if (raw[key] != null && typeof raw[key] !== 'string') {
      throw new HttpError(400, `${key} must be a string`);
    }
  }

  return {
    title: raw.title as string | undefined,
    tenantId: raw.tenantId as string | undefined,
    projectId: raw.projectId as string | undefined,
    userId: raw.userId as string | undefined,
  };
};

const asMessagePayload = (body: unknown): { content: string } => {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'message payload must be an object');
  }

  const raw = body as Record<string, unknown>;
  if (typeof raw.content !== 'string' || raw.content.trim() === '') {
    throw new HttpError(400, 'content must be a non-empty string');
  }

  return { content: raw.content.trim() };
};

const matchThreadPath = (pathname: string): { threadId: string } | null => {
  const match = pathname.match(/^\/api\/v1\/assistant\/threads\/([^/]+)$/);
  if (!match) {
    return null;
  }

  return { threadId: decodeURIComponent(match[1] ?? '') };
};

const matchThreadMessagePath = (pathname: string): { threadId: string } | null => {
  const match = pathname.match(/^\/api\/v1\/assistant\/threads\/([^/]+)\/messages$/);
  if (!match) {
    return null;
  }

  return { threadId: decodeURIComponent(match[1] ?? '') };
};

export interface AiOrchestratorServer {
  baseUrl: string;
  close(): Promise<void>;
}

const projectThread = (thread: AssistantThread) => ({
  ...thread,
  messageCount: thread.messages.length,
  factCount: thread.facts.length,
});

export const startAiOrchestratorServer = async (
  config: AiOrchestratorConfig = loadAiOrchestratorConfig(process.env),
): Promise<AiOrchestratorServer> => {
  const threadStore = await createAssistantThreadStore(config);
  const provider = createAiChatProvider(config);
  const assistantGraph = new AssistantGraphRuntime({
    config,
    provider,
    threadStore,
  });

  const server = http.createServer(async (request, response) => {
    const method = request.method ?? 'GET';
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    const { pathname } = url;

    try {
      if (method === 'GET' && pathname === '/healthz') {
        sendJson(response, 200, {
          status: 'ok',
          service: 'ai-orchestrator',
          provider: provider.name,
          model: provider.model,
          storeMode: threadStore.mode,
        });
        return;
      }

      if (method === 'POST' && pathname === '/api/v1/assistant/threads') {
        const payload = asCreateThreadInput(await readJsonBody(request));
        if (threadStore.mode === 'postgres' && (!payload.tenantId?.trim() || !payload.projectId?.trim())) {
          throw new HttpError(400, 'tenantId and projectId are required when AI_ORCHESTRATOR_STORE_MODE=postgres');
        }

        const thread = await threadStore.createThread(payload);
        sendJson(response, 201, {
          thread: projectThread(thread),
        });
        return;
      }

      const getThreadMatch = method === 'GET' ? matchThreadPath(pathname) : null;
      if (method === 'GET' && getThreadMatch) {
        const thread = await threadStore.getThread(getThreadMatch.threadId);
        if (!thread) {
          throw new HttpError(404, `assistant thread not found: ${getThreadMatch.threadId}`);
        }

        sendJson(response, 200, {
          thread: projectThread(thread),
        });
        return;
      }

      const postMessageMatch = method === 'POST' ? matchThreadMessagePath(pathname) : null;
      if (method === 'POST' && postMessageMatch) {
        const thread = await threadStore.getThread(postMessageMatch.threadId);
        if (!thread) {
          throw new HttpError(404, `assistant thread not found: ${postMessageMatch.threadId}`);
        }

        const payload = asMessagePayload(await readJsonBody(request));
        const turn = await assistantGraph.runTurn(thread.id, payload.content);
        sendJson(response, 200, {
          assistantMessage: turn.assistantMessage,
          thread: projectThread(turn.thread),
        });
        return;
      }

      throw new HttpError(404, `route not found: ${method} ${pathname}`);
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(response, error.statusCode, {
          error: error.message,
        });
        return;
      }

      sendJson(response, 500, {
        error: (error as Error).message,
      });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.hostname, () => {
      server.off('error', reject);
      resolve();
    });
  });

  return {
    baseUrl: `http://127.0.0.1:${config.port}`,
    async close() {
      await Promise.all([
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        }),
        threadStore.close(),
      ]);
    },
  };
};
