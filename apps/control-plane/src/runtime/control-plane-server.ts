import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { URL } from 'node:url';
import type { AddressInfo } from 'node:net';
import type { ControlPlaneServer, JobEventsResponse, RunnerResultEnvelope, StepOverrideRequest } from '../types.js';
import type { StepControlRequest, StepControlResponse } from '@aiwtp/web-worker';
import { InMemoryControlPlaneState } from './control-plane-state.js';

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

export interface StartControlPlaneServerOptions {
  port?: number;
  hostname?: string;
  state?: InMemoryControlPlaneState;
}

export interface StartedControlPlaneServer extends ControlPlaneServer {
  state: InMemoryControlPlaneState;
}

export const startControlPlaneServer = async (options: StartControlPlaneServerOptions = {}): Promise<StartedControlPlaneServer> => {
  const state = options.state ?? new InMemoryControlPlaneState();
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

      if (method === 'POST' && pathname === '/api/v1/internal/runner-results') {
        const body = await readJson<unknown>(request);
        if (!isRunnerResultEnvelope(body)) {
          json(response, 400, { error: { code: 'INVALID_RUNNER_RESULT', message: 'invalid runner result envelope', trace_id: 'local' } });
          return;
        }

        state.recordRunnerEvent(body);
        json(response, 202, { accepted: true });
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

        const decision = state.dequeueStepDecision(jobId, sourceStepId);
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

        state.enqueueStepDecision(jobId, sourceStepId, buildDecision(body));
        json(response, 202, { accepted: true });
        return;
      }

      const eventsMatch = matchPath(pathname, /^\/api\/v1\/internal\/jobs\/([^/]+)\/events$/);
      if (method === 'GET' && eventsMatch) {
        const [, jobId] = eventsMatch;
        const payload: JobEventsResponse = {
          items: state.listJobEvents(jobId),
        };
        json(response, 200, payload);
        return;
      }

      json(response, 404, { error: { code: 'NOT_FOUND', message: 'route not found', trace_id: 'local' } });
    } catch (error) {
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
    state,
    port: address.port,
    baseUrl: `http://${hostname}:${address.port}`,
    async close(): Promise<void> {
      server.close();
      await once(server, 'close');
    },
  };
};
