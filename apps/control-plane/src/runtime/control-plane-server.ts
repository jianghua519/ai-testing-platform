import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { URL } from 'node:url';
import type { AddressInfo } from 'node:net';
import type {
  ControlPlanePage,
  ControlPlaneRunItemRecord,
  ControlPlaneRunRecord,
  ControlPlaneServer,
  ControlPlaneStepEventRecord,
  ControlPlaneStore,
  JobEventsResponse,
  RunnerResultEnvelope,
  StepOverrideRequest,
} from '../types.js';
import type { StepControlRequest, StepControlResponse } from '@aiwtp/web-worker';
import { createControlPlaneStoreFromEnv } from './create-control-plane-store.js';
import { PaginationError, parseLimit } from './pagination.js';

const json = (response: ServerResponse, status: number, payload?: unknown): void => {
  if (payload === undefined) {
    response.writeHead(status);
    response.end();
    return;
  }

  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(payload));
};

const readJson = async <T>(request: IncomingMessage): Promise<T> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {} as T;
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isRunnerResultEnvelope = (value: unknown): value is RunnerResultEnvelope =>
  isObject(value) && typeof value.event_type === 'string' && isObject(value.payload) && typeof value.payload.job_id === 'string';

const isStepControlRequest = (value: unknown): value is StepControlRequest =>
  isObject(value)
  && typeof value.job_id === 'string'
  && typeof value.source_step_id === 'string'
  && typeof value.compiled_step_id === 'string'
  && isObject(value.compiled_step);

const isStepOverrideRequest = (value: unknown): value is StepOverrideRequest =>
  isObject(value)
  && typeof value.action === 'string';

const buildDecision = (request: StepOverrideRequest): StepControlResponse => ({
  action: request.action,
  reason: request.reason,
  replacement_step: request.replacement_step,
  resume_after_ms: request.resume_after_ms,
});

const matchPath = (pathname: string, expression: RegExp): RegExpMatchArray | null => pathname.match(expression);

const toApiRunStatus = (status: string): string => {
  switch (status) {
    case 'passed':
      return 'succeeded';
    case 'failed':
      return 'failed';
    case 'canceled':
      return 'canceled';
    default:
      return 'running';
  }
};

const toApiRun = (run: ControlPlaneRunRecord) => ({
  id: run.runId,
  tenant_id: run.tenantId,
  project_id: run.projectId,
  status: toApiRunStatus(run.status),
  created_at: run.createdAt ?? run.startedAt ?? run.updatedAt ?? new Date().toISOString(),
  updated_at: run.updatedAt ?? run.createdAt ?? run.startedAt ?? new Date().toISOString(),
  summary: {
    last_event_id: run.lastEventId,
    started_at: run.startedAt,
    finished_at: run.finishedAt,
  },
});

const toApiRunItemStatus = (status: string): string => {
  switch (status) {
    case 'passed':
      return 'passed';
    case 'failed':
      return 'failed';
    case 'canceled':
      return 'canceled';
    default:
      return 'running';
  }
};

const toApiRunItem = (runItem: ControlPlaneRunItemRecord) => ({
  id: runItem.runItemId,
  run_id: runItem.runId,
  tenant_id: runItem.tenantId,
  project_id: runItem.projectId,
  status: toApiRunItemStatus(runItem.status),
  attempt_no: runItem.attemptNo,
  artifacts: [],
});

const toApiStepEvent = (stepEvent: ControlPlaneStepEventRecord) => ({
  event_id: stepEvent.eventId,
  run_id: stepEvent.runId,
  run_item_id: stepEvent.runItemId,
  job_id: stepEvent.jobId,
  tenant_id: stepEvent.tenantId,
  project_id: stepEvent.projectId,
  attempt_no: stepEvent.attemptNo,
  compiled_step_id: stepEvent.compiledStepId,
  source_step_id: stepEvent.sourceStepId,
  status: stepEvent.status,
  started_at: stepEvent.startedAt,
  finished_at: stepEvent.finishedAt,
  duration_ms: stepEvent.durationMs,
  error_code: stepEvent.errorCode,
  error_message: stepEvent.errorMessage,
  artifacts: stepEvent.artifacts,
  extracted_variables: stepEvent.extractedVariables,
  received_at: stepEvent.receivedAt,
});

const toPaginatedPayload = <T>(page: ControlPlanePage<T>, mapper: (item: T) => unknown) => ({
  items: page.items.map(mapper),
  next_cursor: page.nextCursor,
});

const requiredQuery = (url: URL, name: string): string => {
  const value = url.searchParams.get(name);
  if (!value) {
    throw new PaginationError(`${name} is required`);
  }
  return value;
};

export interface StartControlPlaneServerOptions {
  port?: number;
  hostname?: string;
  store?: ControlPlaneStore;
}

export interface StartedControlPlaneServer extends ControlPlaneServer {
  store: ControlPlaneStore;
}

export const startControlPlaneServer = async (options: StartControlPlaneServerOptions = {}): Promise<StartedControlPlaneServer> => {
  const store = options.store ?? (await createControlPlaneStoreFromEnv());
  const hostname = options.hostname ?? '127.0.0.1';

  const server = http.createServer(async (request, response) => {
    try {
      const method = request.method ?? 'GET';
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? hostname}`);
      const pathname = url.pathname;

      if (method === 'GET' && pathname === '/healthz') {
        json(response, 200, { status: 'ok' });
        return;
      }

      if (method === 'GET' && pathname === '/api/v1/internal/migrations') {
        json(response, 200, {
          items: (await store.listAppliedMigrations()).map((migration) => ({
            version: migration.version,
            checksum: migration.checksum,
            applied_at: migration.appliedAt,
          })),
        });
        return;
      }

      if (method === 'GET' && pathname === '/api/v1/runs') {
        const page = await store.listRuns({
          tenantId: requiredQuery(url, 'tenant_id'),
          projectId: requiredQuery(url, 'project_id'),
          limit: parseLimit(url.searchParams.get('limit'), 50, 200),
          cursor: url.searchParams.get('cursor') ?? undefined,
        });
        json(response, 200, toPaginatedPayload(page, toApiRun));
        return;
      }

      if (method === 'GET' && pathname === '/api/v1/run-items') {
        const page = await store.listRunItems({
          runId: requiredQuery(url, 'run_id'),
          limit: parseLimit(url.searchParams.get('limit'), 200, 500),
          cursor: url.searchParams.get('cursor') ?? undefined,
        });
        json(response, 200, toPaginatedPayload(page, toApiRunItem));
        return;
      }

      if (method === 'POST' && pathname === '/api/v1/internal/runner-results') {
        const body = await readJson<unknown>(request);
        if (!isRunnerResultEnvelope(body)) {
          json(response, 400, { error: { code: 'INVALID_RUNNER_RESULT', message: 'invalid runner result envelope', trace_id: 'local' } });
          return;
        }

        const result = await store.recordRunnerEvent(body);
        json(response, result.duplicate ? 200 : 202, { accepted: true, duplicate: result.duplicate });
        return;
      }

      const decideMatch = matchPath(pathname, /^\/api\/v1\/agent\/jobs\/([^/]+)\/steps\/([^/]+):decide$/);
      if (method === 'POST' && decideMatch) {
        const [, jobId, sourceStepId] = decideMatch;
        const body = await readJson<unknown>(request);
        if (!isStepControlRequest(body) || body.job_id !== jobId || body.source_step_id !== sourceStepId) {
          json(response, 400, { error: { code: 'INVALID_STEP_CONTROL_REQUEST', message: 'job_id or source_step_id mismatch', trace_id: 'local' } });
          return;
        }

        const decision = await store.dequeueStepDecision(jobId, sourceStepId);
        if (!decision) {
          json(response, 204);
          return;
        }

        json(response, 200, decision);
        return;
      }

      const overrideMatch = matchPath(pathname, /^\/api\/v1\/internal\/jobs\/([^/]+)\/steps\/([^/]+):override$/);
      if (method === 'POST' && overrideMatch) {
        const [, jobId, sourceStepId] = overrideMatch;
        const body = await readJson<unknown>(request);
        if (!isStepOverrideRequest(body)) {
          json(response, 400, { error: { code: 'INVALID_STEP_OVERRIDE', message: 'action is required', trace_id: 'local' } });
          return;
        }

        await store.enqueueStepDecision(jobId, sourceStepId, buildDecision(body));
        json(response, 202, { accepted: true });
        return;
      }

      const eventsMatch = matchPath(pathname, /^\/api\/v1\/internal\/jobs\/([^/]+)\/events$/);
      if (method === 'GET' && eventsMatch) {
        const [, jobId] = eventsMatch;
        const payload: JobEventsResponse = {
          items: await store.listJobEvents(jobId),
        };
        json(response, 200, payload);
        return;
      }

      const runStepEventsMatch = matchPath(pathname, /^\/api\/v1\/internal\/runs\/([^/]+)\/step-events$/);
      if (method === 'GET' && runStepEventsMatch) {
        const [, runId] = runStepEventsMatch;
        const page = await store.listStepEventsByRun(runId, {
          limit: parseLimit(url.searchParams.get('limit'), 200, 500),
          cursor: url.searchParams.get('cursor') ?? undefined,
        });
        json(response, 200, toPaginatedPayload(page, toApiStepEvent));
        return;
      }

      const runMatch = matchPath(pathname, /^\/api\/v1\/runs\/([^/]+)$/);
      if (method === 'GET' && runMatch) {
        const [, runId] = runMatch;
        const run = await store.getRun(runId);
        if (!run) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'run not found', trace_id: 'local' } });
          return;
        }
        json(response, 200, toApiRun(run));
        return;
      }

      const runItemMatch = matchPath(pathname, /^\/api\/v1\/run-items\/([^/]+)$/);
      if (method === 'GET' && runItemMatch) {
        const [, runItemId] = runItemMatch;
        const runItem = await store.getRunItem(runItemId);
        if (!runItem) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'run item not found', trace_id: 'local' } });
          return;
        }
        json(response, 200, toApiRunItem(runItem));
        return;
      }

      const stepEventsMatch = matchPath(pathname, /^\/api\/v1\/internal\/run-items\/([^/]+)\/step-events$/);
      if (method === 'GET' && stepEventsMatch) {
        const [, runItemId] = stepEventsMatch;
        const page = await store.listStepEventsByRunItem(runItemId, {
          limit: parseLimit(url.searchParams.get('limit'), 200, 500),
          cursor: url.searchParams.get('cursor') ?? undefined,
        });
        json(response, 200, toPaginatedPayload(page, toApiStepEvent));
        return;
      }

      json(response, 404, { error: { code: 'NOT_FOUND', message: 'route not found', trace_id: 'local' } });
    } catch (error) {
      if (error instanceof PaginationError) {
        json(response, 400, {
          error: {
            code: 'INVALID_PAGINATION',
            message: error.message,
            trace_id: 'local',
          },
        });
        return;
      }

      json(response, 500, {
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'unknown error',
          trace_id: 'local',
        },
      });
    }
  });

  server.listen(options.port ?? 0, hostname);
  await once(server, 'listening');
  const address = server.address() as AddressInfo;

  return {
    store,
    port: address.port,
    baseUrl: `http://${hostname}:${address.port}`,
    async close(): Promise<void> {
      server.close();
      await once(server, 'close');
      await store.close?.();
    },
  };
};
