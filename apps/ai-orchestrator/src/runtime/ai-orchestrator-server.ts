import http from 'node:http';

import type { AssistantThread, CreateAssistantThreadInput, CreateExplorationInput } from '../types.js';
import { AssistantActionRouter } from './assistant-action-router.js';
import { AssistantGraphRuntime } from './assistant-graph.js';
import { BrowserSessionBroker } from './browser-session-broker.js';
import type { AiOrchestratorConfig } from './config.js';
import { loadAiOrchestratorConfig } from './config.js';
import { ControlPlaneClient } from './control-plane-client.js';
import { ExplorationService } from './exploration-service.js';
import { createOrchestrationStore } from './orchestration-store.js';
import { createAiChatProvider } from './providers.js';
import { RunEvaluationService } from './run-evaluation-service.js';
import { SelfHealService } from './self-heal-service.js';
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

const asObject = (body: unknown, message: string): Record<string, unknown> => {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, message);
  }
  return body as Record<string, unknown>;
};

const optionalString = (value: unknown, field: string): string | undefined => {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new HttpError(400, `${field} must be a string`);
  }
  const normalized = value.trim();
  return normalized ? normalized : undefined;
};

const optionalBoolean = (value: unknown, field: string): boolean | undefined => {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new HttpError(400, `${field} must be a boolean`);
  }
  return value;
};

const asCreateThreadInput = (body: unknown): CreateAssistantThreadInput => {
  const raw = asObject(body, 'thread payload must be an object');
  return {
    title: optionalString(raw.title, 'title'),
    tenantId: optionalString(raw.tenantId, 'tenantId'),
    projectId: optionalString(raw.projectId, 'projectId'),
    userId: optionalString(raw.userId, 'userId'),
  };
};

const asMessagePayload = (body: unknown): { content: string } => {
  const raw = asObject(body, 'message payload must be an object');
  const content = optionalString(raw.content, 'content');
  if (!content) {
    throw new HttpError(400, 'content must be a non-empty string');
  }
  return { content };
};

const asCreateExplorationInput = (body: unknown): CreateExplorationInput => {
  const raw = asObject(body, 'exploration payload must be an object');
  const tenantId = optionalString(raw.tenantId, 'tenantId');
  const projectId = optionalString(raw.projectId, 'projectId');
  const instruction = optionalString(raw.instruction, 'instruction');
  const startUrl = optionalString(raw.startUrl, 'startUrl');
  if (!tenantId || !projectId || !instruction || !startUrl) {
    throw new HttpError(400, 'tenantId, projectId, instruction and startUrl are required');
  }

  const executionMode = optionalString(raw.executionMode, 'executionMode');
  if (executionMode && executionMode !== 'ai' && executionMode !== 'scripted') {
    throw new HttpError(400, 'executionMode must be ai or scripted');
  }

  return {
    tenantId,
    projectId,
    instruction,
    startUrl,
    threadId: optionalString(raw.threadId, 'threadId'),
    userId: optionalString(raw.userId, 'userId'),
    name: optionalString(raw.name, 'name'),
    executionMode: executionMode as CreateExplorationInput['executionMode'] | undefined,
    scriptProfile: optionalString(raw.scriptProfile, 'scriptProfile'),
  };
};

const asSubjectPayload = (body: unknown): { subjectId?: string } => {
  const raw = asObject(body, 'payload must be an object');
  return {
    subjectId: optionalString(raw.subjectId, 'subjectId'),
  };
};

const asPublishExplorationPayload = (body: unknown): {
  subjectId?: string;
  name?: string;
  versionLabel?: string;
  changeSummary?: string;
  publish?: boolean;
  defaultDatasetName?: string;
} => {
  const raw = asObject(body, 'publish payload must be an object');
  return {
    subjectId: optionalString(raw.subjectId, 'subjectId'),
    name: optionalString(raw.name, 'name'),
    versionLabel: optionalString(raw.versionLabel, 'versionLabel'),
    changeSummary: optionalString(raw.changeSummary, 'changeSummary'),
    publish: optionalBoolean(raw.publish, 'publish'),
    defaultDatasetName: optionalString(raw.defaultDatasetName, 'defaultDatasetName'),
  };
};

const asRunItemActionPayload = (body: unknown): {
  subjectId?: string;
  tenantId?: string;
  deriveDraftVersionOnSuccess?: boolean;
} => {
  const raw = asObject(body, 'run item action payload must be an object');
  return {
    subjectId: optionalString(raw.subjectId, 'subjectId'),
    tenantId: optionalString(raw.tenantId, 'tenantId'),
    deriveDraftVersionOnSuccess: optionalBoolean(raw.deriveDraftVersionOnSuccess, 'deriveDraftVersionOnSuccess'),
  };
};

const matchPath = (pathname: string, pattern: RegExp): string[] | null => pathname.match(pattern);

export interface AiOrchestratorServer {
  baseUrl: string;
  close(): Promise<void>;
}

const projectThread = (thread: AssistantThread) => ({
  ...thread,
  messageCount: thread.messages.length,
  factCount: thread.facts.length,
});

const resolveSubjectId = (threadOrUser: { userId?: string | null }, explicitSubjectId: string | undefined): string =>
  explicitSubjectId ?? threadOrUser.userId ?? 'assistant-user';

export const startAiOrchestratorServer = async (
  config: AiOrchestratorConfig = loadAiOrchestratorConfig(process.env),
): Promise<AiOrchestratorServer> => {
  const threadStore = await createAssistantThreadStore(config);
  const orchestrationStore = await createOrchestrationStore(config);
  const provider = createAiChatProvider(config);
  const controlPlaneClient = new ControlPlaneClient(config);
  const browserBroker = new BrowserSessionBroker(config);
  const explorationService = new ExplorationService({
    config,
    store: orchestrationStore,
    controlPlaneClient,
    browserBroker,
  });
  const selfHealService = new SelfHealService({
    controlPlaneClient,
    store: orchestrationStore,
  });
  const runEvaluationService = new RunEvaluationService({
    controlPlaneClient,
    provider,
    store: orchestrationStore,
    selfHealService,
  });
  const actionRouter = new AssistantActionRouter({
    explorationService,
    selfHealService,
    runEvaluationService,
  });
  const assistantGraph = new AssistantGraphRuntime({
    actionRouter,
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
          capabilities: ['assistant', 'exploration', 'self-heal', 'run-evaluation', 'browser-assist'],
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

      const assistantThreadMatch = method === 'GET'
        ? matchPath(pathname, /^\/api\/v1\/assistant\/threads\/([^/]+)$/)
        : null;
      if (method === 'GET' && assistantThreadMatch) {
        const threadId = decodeURIComponent(assistantThreadMatch[1] ?? '');
        const thread = await threadStore.getThread(threadId);
        if (!thread) {
          throw new HttpError(404, `assistant thread not found: ${threadId}`);
        }

        sendJson(response, 200, {
          thread: projectThread(thread),
        });
        return;
      }

      const assistantMessageMatch = method === 'POST'
        ? matchPath(pathname, /^\/api\/v1\/assistant\/threads\/([^/]+)\/messages$/)
        : null;
      if (method === 'POST' && assistantMessageMatch) {
        const threadId = decodeURIComponent(assistantMessageMatch[1] ?? '');
        const thread = await threadStore.getThread(threadId);
        if (!thread) {
          throw new HttpError(404, `assistant thread not found: ${threadId}`);
        }

        const payload = asMessagePayload(await readJsonBody(request));
        const turn = await assistantGraph.runTurn(thread.id, payload.content);
        sendJson(response, 200, {
          assistantMessage: turn.assistantMessage,
          action: turn.action,
          thread: projectThread(turn.thread),
        });
        return;
      }

      if (method === 'POST' && pathname === '/api/v1/explorations') {
        const payload = asCreateExplorationInput(await readJsonBody(request));
        const exploration = await explorationService.createExploration(payload);
        sendJson(response, 201, { exploration });
        return;
      }

      const explorationMatch = method === 'GET'
        ? matchPath(pathname, /^\/api\/v1\/explorations\/([^/:]+)$/)
        : null;
      if (method === 'GET' && explorationMatch) {
        const explorationId = decodeURIComponent(explorationMatch[1] ?? '');
        const exploration = await explorationService.getExploration(explorationId);
        if (!exploration) {
          throw new HttpError(404, `exploration not found: ${explorationId}`);
        }
        sendJson(response, 200, { exploration });
        return;
      }

      const startExplorationMatch = method === 'POST'
        ? matchPath(pathname, /^\/api\/v1\/explorations\/([^/:]+):start$/)
        : null;
      if (method === 'POST' && startExplorationMatch) {
        const explorationId = decodeURIComponent(startExplorationMatch[1] ?? '');
        const exploration = await explorationService.getExploration(explorationId);
        if (!exploration) {
          throw new HttpError(404, `exploration not found: ${explorationId}`);
        }
        const payload = asSubjectPayload(await readJsonBody(request));
        const started = await explorationService.startExploration(
          explorationId,
          resolveSubjectId(exploration, payload.subjectId),
        );
        sendJson(response, 200, { exploration: started });
        return;
      }

      const stopExplorationMatch = method === 'POST'
        ? matchPath(pathname, /^\/api\/v1\/explorations\/([^/:]+):stop$/)
        : null;
      if (method === 'POST' && stopExplorationMatch) {
        const explorationId = decodeURIComponent(stopExplorationMatch[1] ?? '');
        const stopped = await explorationService.stopExploration(explorationId);
        sendJson(response, 200, { exploration: stopped });
        return;
      }

      const publishExplorationMatch = method === 'POST'
        ? matchPath(pathname, /^\/api\/v1\/explorations\/([^/:]+):publish-test-case$/)
        : null;
      if (method === 'POST' && publishExplorationMatch) {
        const explorationId = decodeURIComponent(publishExplorationMatch[1] ?? '');
        const exploration = await explorationService.getExploration(explorationId);
        if (!exploration) {
          throw new HttpError(404, `exploration not found: ${explorationId}`);
        }
        const payload = asPublishExplorationPayload(await readJsonBody(request));
        const published = await explorationService.publishExplorationCase(explorationId, {
          subjectId: resolveSubjectId(exploration, payload.subjectId),
          name: payload.name,
          versionLabel: payload.versionLabel,
          changeSummary: payload.changeSummary,
          publish: payload.publish,
          defaultDatasetName: payload.defaultDatasetName,
        });
        sendJson(response, 201, published);
        return;
      }

      const selfHealMatch = method === 'POST'
        ? matchPath(pathname, /^\/api\/v1\/run-items\/([^/:]+):self-heal$/)
        : null;
      if (method === 'POST' && selfHealMatch) {
        const runItemId = decodeURIComponent(selfHealMatch[1] ?? '');
        const payload = asRunItemActionPayload(await readJsonBody(request));
        if (!payload.tenantId) {
          throw new HttpError(400, 'tenantId is required for self-heal');
        }

        const attempt = await selfHealService.executeSelfHeal({
          subjectId: payload.subjectId ?? 'assistant-user',
          tenantId: payload.tenantId,
          runItemId,
          deriveDraftVersionOnSuccess: payload.deriveDraftVersionOnSuccess,
        });
        sendJson(response, 200, { selfHealAttempt: attempt });
        return;
      }

      const evaluateRunItemMatch = method === 'POST'
        ? matchPath(pathname, /^\/api\/v1\/run-items\/([^/:]+):evaluate$/)
        : null;
      if (method === 'POST' && evaluateRunItemMatch) {
        const runItemId = decodeURIComponent(evaluateRunItemMatch[1] ?? '');
        const payload = asRunItemActionPayload(await readJsonBody(request));
        if (!payload.tenantId) {
          throw new HttpError(400, 'tenantId is required for run evaluation');
        }

        const evaluation = await runEvaluationService.evaluateRunItem({
          subjectId: payload.subjectId ?? 'assistant-user',
          tenantId: payload.tenantId,
          runItemId,
        });
        sendJson(response, 201, { runEvaluation: evaluation });
        return;
      }

      const runEvaluationMatch = method === 'GET'
        ? matchPath(pathname, /^\/api\/v1\/run-evaluations\/([^/:]+)$/)
        : null;
      if (method === 'GET' && runEvaluationMatch) {
        const runEvaluationId = decodeURIComponent(runEvaluationMatch[1] ?? '');
        const evaluation = await runEvaluationService.getRunEvaluation(runEvaluationId);
        if (!evaluation) {
          throw new HttpError(404, `run evaluation not found: ${runEvaluationId}`);
        }
        sendJson(response, 200, { runEvaluation: evaluation });
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
        explorationService.close(),
        threadStore.close(),
        orchestrationStore.close(),
      ]);
    },
  };
};
