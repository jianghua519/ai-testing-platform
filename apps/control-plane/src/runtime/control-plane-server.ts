import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { pipeline } from 'node:stream/promises';
import { URL } from 'node:url';
import type { AddressInfo } from 'node:net';
import type {
  ControlPlaneAcquireLeaseInput,
  ControlPlaneAgentRecord,
  ControlPlaneArtifactRecord,
  ControlPlaneCompleteLeaseInput,
  ControlPlaneEnqueueWebRunInput,
  ControlPlaneHeartbeatAgentInput,
  ControlPlaneHeartbeatLeaseInput,
  ControlPlaneJobLeaseRecord,
  ControlPlanePage,
  ControlPlanePrincipal,
  ControlPlaneRegisterAgentInput,
  ControlPlaneRunItemRecord,
  ControlPlaneRunRecord,
  ControlPlaneSchedulingStore,
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
import { createArtifactBlobStoreFromEnv, type ArtifactDownloadMode } from './artifact-blob-store.js';
import { readBearerToken, verifyControlPlaneJwt } from './auth.js';

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
const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);
const isPositiveInteger = (value: unknown): value is number => Number.isInteger(value) && Number(value) > 0;

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

const isArtifactDownloadMode = (value: string): value is ArtifactDownloadMode =>
  value === 'redirect' || value === 'stream';

const isEnqueueWebRunRequest = (value: unknown): value is ControlPlaneEnqueueWebRunInput =>
  isObject(value)
  && isString(value.tenantId ?? value.tenant_id)
  && isString(value.projectId ?? value.project_id)
  && isString(value.name)
  && isObject(value.plan)
  && isObject(value.envProfile ?? value.env_profile)
  && ((value.requiredCapabilities === undefined && value.required_capabilities === undefined)
    || isStringArray(value.requiredCapabilities ?? value.required_capabilities))
  && (value.variableContext === undefined || value.variable_context === undefined || isObject(value.variableContext ?? value.variable_context));

const isRegisterAgentRequest = (value: unknown): value is ControlPlaneRegisterAgentInput =>
  isObject(value)
  && isString(value.agentId ?? value.agent_id)
  && isString(value.tenantId ?? value.tenant_id)
  && isString(value.name)
  && isString(value.platform)
  && isString(value.architecture)
  && isString(value.runtimeKind ?? value.runtime_kind)
  && isStringArray(value.capabilities)
  && (value.maxParallelSlots === undefined || value.max_parallel_slots === undefined || isPositiveInteger(value.maxParallelSlots ?? value.max_parallel_slots))
  && (value.projectId === undefined || value.project_id === undefined || typeof (value.projectId ?? value.project_id) === 'string');

const isHeartbeatAgentRequest = (value: unknown): value is ControlPlaneHeartbeatAgentInput =>
  isObject(value)
  && (value.status === undefined || isString(value.status))
  && (value.capabilities === undefined || isStringArray(value.capabilities))
  && (value.metadata === undefined || isObject(value.metadata))
  && (value.maxParallelSlots === undefined || value.max_parallel_slots === undefined || isPositiveInteger(value.maxParallelSlots ?? value.max_parallel_slots));

const isAcquireLeaseRequest = (value: unknown): value is ControlPlaneAcquireLeaseInput =>
  isObject(value)
  && isStringArray(value.supported_job_kinds ?? value.supportedJobKinds)
  && Number.isInteger(value.lease_ttl_seconds ?? value.leaseTtlSeconds)
  && Number(value.lease_ttl_seconds ?? value.leaseTtlSeconds) > 0;

const isHeartbeatLeaseRequest = (value: unknown): value is ControlPlaneHeartbeatLeaseInput =>
  isObject(value)
  && Number.isInteger(value.lease_ttl_seconds ?? value.leaseTtlSeconds)
  && Number(value.lease_ttl_seconds ?? value.leaseTtlSeconds) > 0;

const isCompleteLeaseRequest = (value: unknown): value is ControlPlaneCompleteLeaseInput =>
  isObject(value)
  && ['succeeded', 'failed', 'canceled'].includes(String(value.status));

const normalizeEnqueueWebRun = (value: Record<string, unknown>): ControlPlaneEnqueueWebRunInput => ({
  tenantId: String(value.tenantId ?? value.tenant_id),
  projectId: String(value.projectId ?? value.project_id),
  name: String(value.name),
  mode: typeof value.mode === 'string' ? value.mode : undefined,
  plan: value.plan as ControlPlaneEnqueueWebRunInput['plan'],
  envProfile: (value.envProfile ?? value.env_profile) as ControlPlaneEnqueueWebRunInput['envProfile'],
  requiredCapabilities: isStringArray(value.requiredCapabilities ?? value.required_capabilities)
    ? [...(value.requiredCapabilities ?? value.required_capabilities) as string[]]
    : undefined,
  variableContext: (value.variableContext ?? value.variable_context) as Record<string, unknown> | undefined,
  traceId: typeof value.traceId === 'string' ? value.traceId : typeof value.trace_id === 'string' ? value.trace_id : undefined,
  correlationId: typeof value.correlationId === 'string' ? value.correlationId : typeof value.correlation_id === 'string' ? value.correlation_id : undefined,
});

const normalizeRegisterAgent = (value: Record<string, unknown>): ControlPlaneRegisterAgentInput => ({
  agentId: String(value.agentId ?? value.agent_id),
  tenantId: String(value.tenantId ?? value.tenant_id),
  projectId: typeof (value.projectId ?? value.project_id) === 'string' ? String(value.projectId ?? value.project_id) : undefined,
  name: String(value.name),
  platform: String(value.platform),
  architecture: String(value.architecture),
  runtimeKind: String(value.runtimeKind ?? value.runtime_kind),
  capabilities: (value.capabilities as string[]) ?? [],
  metadata: isObject(value.metadata) ? value.metadata : undefined,
  status: typeof value.status === 'string' ? value.status : undefined,
  maxParallelSlots: isPositiveInteger(value.maxParallelSlots ?? value.max_parallel_slots)
    ? Number(value.maxParallelSlots ?? value.max_parallel_slots)
    : undefined,
});

const normalizeHeartbeatAgent = (value: Record<string, unknown>): ControlPlaneHeartbeatAgentInput => ({
  status: typeof value.status === 'string' ? value.status : undefined,
  capabilities: isStringArray(value.capabilities) ? value.capabilities : undefined,
  metadata: isObject(value.metadata) ? value.metadata : undefined,
  maxParallelSlots: isPositiveInteger(value.maxParallelSlots ?? value.max_parallel_slots)
    ? Number(value.maxParallelSlots ?? value.max_parallel_slots)
    : undefined,
});

const normalizeAcquireLease = (value: Record<string, unknown>): ControlPlaneAcquireLeaseInput => ({
  supportedJobKinds: (value.supportedJobKinds ?? value.supported_job_kinds) as string[],
  leaseTtlSeconds: Number(value.leaseTtlSeconds ?? value.lease_ttl_seconds),
});

const normalizeHeartbeatLease = (value: Record<string, unknown>): ControlPlaneHeartbeatLeaseInput => ({
  leaseTtlSeconds: Number(value.leaseTtlSeconds ?? value.lease_ttl_seconds),
});

const buildDecision = (request: StepOverrideRequest): StepControlResponse => ({
  action: request.action,
  reason: request.reason,
  replacement_step: request.replacement_step,
  resume_after_ms: request.resume_after_ms,
});

const matchPath = (pathname: string, expression: RegExp): RegExpMatchArray | null => pathname.match(expression);

const toApiRunStatus = (status: string): string => {
  switch (status) {
    case 'created':
      return 'created';
    case 'queued':
      return 'queued';
    case 'passed':
      return 'succeeded';
    case 'failed':
      return 'failed';
    case 'canceling':
      return 'canceling';
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
  name: run.name ?? undefined,
  status: toApiRunStatus(run.status),
  created_at: run.createdAt ?? run.startedAt ?? run.updatedAt ?? new Date().toISOString(),
  updated_at: run.updatedAt ?? run.createdAt ?? run.startedAt ?? new Date().toISOString(),
  summary: {
    last_event_id: run.lastEventId,
    started_at: run.startedAt,
    finished_at: run.finishedAt,
    mode: run.mode ?? undefined,
  },
});

const toApiRunItemStatus = (status: string): string => {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'dispatched':
      return 'dispatched';
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
  summary: {
    job_id: runItem.jobId,
    job_kind: runItem.jobKind ?? undefined,
    required_capabilities: runItem.requiredCapabilities ?? undefined,
    assigned_agent_id: runItem.assignedAgentId ?? undefined,
    lease_token: runItem.leaseToken ?? undefined,
    control_state: runItem.controlState ?? undefined,
    control_reason: runItem.controlReason ?? undefined,
  },
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

const toApiAgent = (agent: ControlPlaneAgentRecord) => ({
  agent_id: agent.agentId,
  tenant_id: agent.tenantId,
  project_id: agent.projectId,
  name: agent.name,
  platform: agent.platform,
  architecture: agent.architecture,
  runtime_kind: agent.runtimeKind,
  status: agent.status,
  capabilities: agent.capabilities,
  metadata: agent.metadata,
  max_parallel_slots: agent.maxParallelSlots,
  last_heartbeat_at: agent.lastHeartbeatAt,
  created_at: agent.createdAt,
  updated_at: agent.updatedAt,
});

const toApiArtifact = (artifact: ControlPlaneArtifactRecord) => ({
  artifact_id: artifact.artifactId,
  tenant_id: artifact.tenantId,
  project_id: artifact.projectId,
  run_id: artifact.runId,
  run_item_id: artifact.runItemId,
  step_event_id: artifact.stepEventId,
  job_id: artifact.jobId,
  artifact_type: artifact.artifactType,
  storage_uri: artifact.storageUri,
  content_type: artifact.contentType,
  size_bytes: artifact.sizeBytes,
  sha256: artifact.sha256,
  metadata: artifact.metadata,
  retention_expires_at: artifact.retentionExpiresAt,
  created_at: artifact.createdAt,
});

const toApiPrincipal = (principal: ControlPlanePrincipal) => ({
  subject_id: principal.subjectId,
  tenant_id: principal.tenantId,
  project_ids: principal.projectIds,
  roles: principal.roles,
});

const toApiLease = (lease: ControlPlaneJobLeaseRecord) => ({
  lease_id: lease.leaseId,
  lease_token: lease.leaseToken,
  job_id: lease.jobId,
  run_id: lease.runId,
  run_item_id: lease.runItemId,
  agent_id: lease.agentId,
  attempt_no: lease.attemptNo,
  status: lease.status,
  acquired_at: lease.acquiredAt,
  expires_at: lease.expiresAt,
  heartbeat_at: lease.heartbeatAt,
  released_at: lease.releasedAt,
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

const unauthorized = (response: ServerResponse, message: string): void => {
  json(response, 401, {
    error: {
      code: 'UNAUTHORIZED',
      message,
      trace_id: 'local',
    },
  });
};

const forbidden = (response: ServerResponse, code: string, message: string): void => {
  json(response, 403, {
    error: {
      code,
      message,
      trace_id: 'local',
    },
  });
};

const canAccessProject = (principal: ControlPlanePrincipal, projectId: string): boolean =>
  principal.projectIds.includes(projectId);

const notSupported = (response: ServerResponse, capability: string): void => {
  json(response, 501, {
    error: {
      code: 'NOT_SUPPORTED',
      message: `${capability} requires a postgres-backed scheduling store`,
      trace_id: 'local',
    },
  });
};

const isArtifactMissingError = (error: unknown): boolean => {
  if (!isObject(error)) {
    return false;
  }

  const name = typeof error.name === 'string' ? error.name : '';
  const message = typeof error.message === 'string' ? error.message : '';
  const statusCode = isObject(error.$metadata) && typeof error.$metadata.httpStatusCode === 'number'
    ? error.$metadata.httpStatusCode
    : undefined;

  return name === 'NoSuchKey'
    || name === 'NotFound'
    || message.includes('ENOENT')
    || statusCode === 404;
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
  const artifactBlobStore = createArtifactBlobStoreFromEnv();
  const authenticatePrincipal = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<ControlPlanePrincipal | undefined> => {
    if (!store.resolvePrincipal) {
      notSupported(response, 'token-backed principal resolution');
      return undefined;
    }

    try {
      const token = readBearerToken(request.headers.authorization);
      const actor = verifyControlPlaneJwt(token);
      return await store.resolvePrincipal({
        subjectId: actor.subjectId,
        tenantId: actor.tenantId,
      });
    } catch (error) {
      unauthorized(response, error instanceof Error ? error.message : 'authentication failed');
      return undefined;
    }
  };

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

      if (method === 'GET' && pathname === '/api/v1/me') {
        const principal = await authenticatePrincipal(request, response);
        if (!principal) {
          return;
        }

        json(response, 200, toApiPrincipal(principal));
        return;
      }

      if (method === 'POST' && pathname === '/api/v1/internal/runs:enqueue-web') {
        if (!store.enqueueWebRun) {
          notSupported(response, 'enqueue-web');
          return;
        }

        const body = await readJson<unknown>(request);
        if (!isEnqueueWebRunRequest(body)) {
          json(response, 400, { error: { code: 'INVALID_ENQUEUE_REQUEST', message: 'tenant_id, project_id, name, plan and env_profile are required', trace_id: 'local' } });
          return;
        }

        const queued = await store.enqueueWebRun(normalizeEnqueueWebRun(body as unknown as Record<string, unknown>));
        json(response, 201, {
          run: toApiRun(queued.run),
          run_item: toApiRunItem(queued.runItem),
          job: queued.job,
        });
        return;
      }

      if (method === 'POST' && pathname === '/api/v1/internal/agents:register') {
        if (!store.registerAgent) {
          notSupported(response, 'agent registration');
          return;
        }

        const body = await readJson<unknown>(request);
        if (!isRegisterAgentRequest(body)) {
          json(response, 400, { error: { code: 'INVALID_AGENT_REGISTRATION', message: 'agent_id, tenant_id, name, platform, architecture, runtime_kind and capabilities are required', trace_id: 'local' } });
          return;
        }

        const agent = await store.registerAgent(normalizeRegisterAgent(body as unknown as Record<string, unknown>));
        json(response, 200, toApiAgent(agent));
        return;
      }

      const agentHeartbeatMatch = matchPath(pathname, /^\/api\/v1\/internal\/agents\/([^/]+):heartbeat$/);
      if (method === 'POST' && agentHeartbeatMatch) {
        if (!store.heartbeatAgent) {
          notSupported(response, 'agent heartbeat');
          return;
        }

        const [, agentId] = agentHeartbeatMatch;
        const body = await readJson<unknown>(request);
        if (!isHeartbeatAgentRequest(body)) {
          json(response, 400, { error: { code: 'INVALID_AGENT_HEARTBEAT', message: 'invalid heartbeat payload', trace_id: 'local' } });
          return;
        }

        const agent = await store.heartbeatAgent(agentId, normalizeHeartbeatAgent(body as Record<string, unknown>));
        if (!agent) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'agent not found', trace_id: 'local' } });
          return;
        }

        json(response, 200, toApiAgent(agent));
        return;
      }

      const acquireLeaseMatch = matchPath(pathname, /^\/api\/v1\/internal\/agents\/([^/]+):acquire-lease$/);
      if (method === 'POST' && acquireLeaseMatch) {
        if (!store.acquireLease) {
          notSupported(response, 'lease acquisition');
          return;
        }

        const [, agentId] = acquireLeaseMatch;
        const body = await readJson<unknown>(request);
        if (!isAcquireLeaseRequest(body)) {
          json(response, 400, { error: { code: 'INVALID_ACQUIRE_LEASE', message: 'supported_job_kinds and lease_ttl_seconds are required', trace_id: 'local' } });
          return;
        }

        const lease = await store.acquireLease(agentId, normalizeAcquireLease(body as unknown as Record<string, unknown>));
        if (!lease) {
          json(response, 204);
          return;
        }

        json(response, 200, {
          lease: toApiLease(lease.lease),
          job: lease.job,
        });
        return;
      }

      const heartbeatLeaseMatch = matchPath(pathname, /^\/api\/v1\/internal\/leases\/([^/]+):heartbeat$/);
      if (method === 'POST' && heartbeatLeaseMatch) {
        if (!store.heartbeatLease) {
          notSupported(response, 'lease heartbeat');
          return;
        }

        const [, leaseToken] = heartbeatLeaseMatch;
        const body = await readJson<unknown>(request);
        if (!isHeartbeatLeaseRequest(body)) {
          json(response, 400, { error: { code: 'INVALID_LEASE_HEARTBEAT', message: 'lease_ttl_seconds is required', trace_id: 'local' } });
          return;
        }

        const lease = await store.heartbeatLease(leaseToken, normalizeHeartbeatLease(body as unknown as Record<string, unknown>));
        if (!lease) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'lease not found', trace_id: 'local' } });
          return;
        }

        json(response, 200, toApiLease(lease));
        return;
      }

      const completeLeaseMatch = matchPath(pathname, /^\/api\/v1\/internal\/leases\/([^/]+):complete$/);
      if (method === 'POST' && completeLeaseMatch) {
        if (!store.completeLease) {
          notSupported(response, 'lease completion');
          return;
        }

        const [, leaseToken] = completeLeaseMatch;
        const body = await readJson<unknown>(request);
        if (!isCompleteLeaseRequest(body)) {
          json(response, 400, { error: { code: 'INVALID_LEASE_COMPLETION', message: 'status must be one of succeeded, failed, canceled', trace_id: 'local' } });
          return;
        }

        const lease = await store.completeLease(leaseToken, body as ControlPlaneCompleteLeaseInput);
        if (!lease) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'lease not found', trace_id: 'local' } });
          return;
        }

        json(response, 200, toApiLease(lease));
        return;
      }

      if (method === 'GET' && pathname === '/api/v1/runs') {
        const principal = await authenticatePrincipal(request, response);
        if (!principal) {
          return;
        }

        const tenantId = requiredQuery(url, 'tenant_id');
        const projectId = requiredQuery(url, 'project_id');
        if (tenantId !== principal.tenantId) {
          forbidden(response, 'TENANT_SCOPE_MISMATCH', 'tenant_id must match authenticated principal');
          return;
        }
        if (!canAccessProject(principal, projectId)) {
          forbidden(response, 'PROJECT_ACCESS_DENIED', 'project_id is not granted to the principal');
          return;
        }

        const page = await store.listRuns({
          tenantId,
          projectId,
          limit: parseLimit(url.searchParams.get('limit'), 50, 200),
          cursor: url.searchParams.get('cursor') ?? undefined,
        });
        json(response, 200, toPaginatedPayload(page, toApiRun));
        return;
      }

      if (method === 'GET' && pathname === '/api/v1/run-items') {
        const principal = await authenticatePrincipal(request, response);
        if (!principal) {
          return;
        }

        const runId = requiredQuery(url, 'run_id');
        const run = await store.getRun(runId);
        if (!run) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'run not found', trace_id: 'local' } });
          return;
        }
        if (run.tenantId !== principal.tenantId) {
          forbidden(response, 'TENANT_SCOPE_MISMATCH', 'run tenant_id must match authenticated principal');
          return;
        }
        if (!canAccessProject(principal, run.projectId)) {
          forbidden(response, 'PROJECT_ACCESS_DENIED', 'run project_id is not granted to the principal');
          return;
        }

        const page = await store.listRunItems({
          runId,
          limit: parseLimit(url.searchParams.get('limit'), 200, 500),
          cursor: url.searchParams.get('cursor') ?? undefined,
        });
        json(response, 200, toPaginatedPayload(page, toApiRunItem));
        return;
      }

      const pauseRunMatch = matchPath(pathname, /^\/api\/v1\/internal\/runs\/([^/]+):pause$/);
      if (method === 'POST' && pauseRunMatch) {
        if (!store.pauseRun) {
          notSupported(response, 'pause run');
          return;
        }

        const [, runId] = pauseRunMatch;
        const run = await store.pauseRun(runId);
        if (!run) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'run not found', trace_id: 'local' } });
          return;
        }

        json(response, 202, toApiRun(run));
        return;
      }

      const resumeRunMatch = matchPath(pathname, /^\/api\/v1\/internal\/runs\/([^/]+):resume$/);
      if (method === 'POST' && resumeRunMatch) {
        if (!store.resumeRun) {
          notSupported(response, 'resume run');
          return;
        }

        const [, runId] = resumeRunMatch;
        const run = await store.resumeRun(runId);
        if (!run) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'run not found', trace_id: 'local' } });
          return;
        }

        json(response, 202, toApiRun(run));
        return;
      }

      const cancelRunMatch = matchPath(pathname, /^\/api\/v1\/runs\/([^/]+):cancel$/);
      if (method === 'POST' && cancelRunMatch) {
        const principal = await authenticatePrincipal(request, response);
        if (!principal) {
          return;
        }

        if (!store.cancelRun) {
          notSupported(response, 'cancel run');
          return;
        }

        const [, runId] = cancelRunMatch;
        const existingRun = await store.getRun(runId);
        if (!existingRun) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'run not found', trace_id: 'local' } });
          return;
        }
        if (existingRun.tenantId !== principal.tenantId) {
          forbidden(response, 'TENANT_SCOPE_MISMATCH', 'run tenant_id must match authenticated principal');
          return;
        }
        if (!canAccessProject(principal, existingRun.projectId)) {
          forbidden(response, 'PROJECT_ACCESS_DENIED', 'run project_id is not granted to the principal');
          return;
        }

        const run = await store.cancelRun(runId);
        if (!run) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'run not found', trace_id: 'local' } });
          return;
        }

        json(response, 202, toApiRun(run));
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

        const decision = store.resolveStepControlDecision
          ? await store.resolveStepControlDecision(jobId, body.run_id, body.run_item_id, sourceStepId, {
            tenantId: body.tenant_id,
          })
          : await store.dequeueStepDecision(jobId, sourceStepId);
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

        await store.enqueueStepDecision(jobId, sourceStepId, buildDecision(body), {
          tenantId: typeof body.tenant_id === 'string' ? body.tenant_id : undefined,
          runId: typeof body.run_id === 'string' ? body.run_id : undefined,
          runItemId: typeof body.run_item_id === 'string' ? body.run_item_id : undefined,
        });
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

      const runArtifactsMatch = matchPath(pathname, /^\/api\/v1\/internal\/runs\/([^/]+)\/artifacts$/);
      if (method === 'GET' && runArtifactsMatch) {
        if (!store.listArtifactsByRun) {
          notSupported(response, 'list run artifacts');
          return;
        }

        const [, runId] = runArtifactsMatch;
        const page = await store.listArtifactsByRun(runId, {
          limit: parseLimit(url.searchParams.get('limit'), 200, 500),
          cursor: url.searchParams.get('cursor') ?? undefined,
        });
        json(response, 200, toPaginatedPayload(page, toApiArtifact));
        return;
      }

      const artifactDownloadMatch = matchPath(pathname, /^\/api\/v1\/internal\/artifacts\/([^/]+)\/download$/);
      if (method === 'GET' && artifactDownloadMatch) {
        if (!store.getArtifact) {
          notSupported(response, 'download artifact');
          return;
        }

        const [, artifactId] = artifactDownloadMatch;
        const modeValue = url.searchParams.get('mode') ?? 'redirect';
        if (!isArtifactDownloadMode(modeValue)) {
          json(response, 400, { error: { code: 'INVALID_ARTIFACT_DOWNLOAD_MODE', message: 'mode must be redirect or stream', trace_id: 'local' } });
          return;
        }

        const artifact = await store.getArtifact(artifactId);
        if (!artifact) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'artifact not found', trace_id: 'local' } });
          return;
        }

        try {
          const descriptor = await artifactBlobStore.openDownload(artifact, modeValue);
          if (descriptor.kind === 'redirect') {
            response.writeHead(302, { location: descriptor.location ?? '' });
            response.end();
            return;
          }

          response.writeHead(200, {
            'content-type': descriptor.contentType ?? 'application/octet-stream',
            'content-disposition': `attachment; filename="${descriptor.filename}"`,
            ...(descriptor.contentLength !== null && descriptor.contentLength !== undefined
              ? { 'content-length': String(descriptor.contentLength) }
              : {}),
          });
          await pipeline(descriptor.body!, response);
          return;
        } catch (error) {
          if (isArtifactMissingError(error)) {
            json(response, 404, { error: { code: 'ARTIFACT_BLOB_NOT_FOUND', message: 'artifact blob not found', trace_id: 'local' } });
            return;
          }
          throw error;
        }
      }

      const runMatch = matchPath(pathname, /^\/api\/v1\/runs\/([^/]+)$/);
      if (method === 'GET' && runMatch) {
        const principal = await authenticatePrincipal(request, response);
        if (!principal) {
          return;
        }

        const [, runId] = runMatch;
        const run = await store.getRun(runId);
        if (!run) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'run not found', trace_id: 'local' } });
          return;
        }
        if (run.tenantId !== principal.tenantId) {
          forbidden(response, 'TENANT_SCOPE_MISMATCH', 'run tenant_id must match authenticated principal');
          return;
        }
        if (!canAccessProject(principal, run.projectId)) {
          forbidden(response, 'PROJECT_ACCESS_DENIED', 'run project_id is not granted to the principal');
          return;
        }
        json(response, 200, toApiRun(run));
        return;
      }

      const runItemMatch = matchPath(pathname, /^\/api\/v1\/run-items\/([^/]+)$/);
      if (method === 'GET' && runItemMatch) {
        const principal = await authenticatePrincipal(request, response);
        if (!principal) {
          return;
        }

        const [, runItemId] = runItemMatch;
        const runItem = await store.getRunItem(runItemId);
        if (!runItem) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'run item not found', trace_id: 'local' } });
          return;
        }
        if (runItem.tenantId !== principal.tenantId) {
          forbidden(response, 'TENANT_SCOPE_MISMATCH', 'run item tenant_id must match authenticated principal');
          return;
        }
        if (!canAccessProject(principal, runItem.projectId)) {
          forbidden(response, 'PROJECT_ACCESS_DENIED', 'run item project_id is not granted to the principal');
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

      const artifactsMatch = matchPath(pathname, /^\/api\/v1\/internal\/run-items\/([^/]+)\/artifacts$/);
      if (method === 'GET' && artifactsMatch) {
        if (!store.listArtifactsByRunItem) {
          notSupported(response, 'list run item artifacts');
          return;
        }

        const [, runItemId] = artifactsMatch;
        const page = await store.listArtifactsByRunItem(runItemId, {
          limit: parseLimit(url.searchParams.get('limit'), 200, 500),
          cursor: url.searchParams.get('cursor') ?? undefined,
        });
        json(response, 200, toPaginatedPayload(page, toApiArtifact));
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
