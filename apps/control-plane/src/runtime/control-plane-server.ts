import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { pipeline } from 'node:stream/promises';
import { URL } from 'node:url';
import type { AddressInfo } from 'node:net';
import type {
  ControlPlaneAcquireLeaseInput,
  ControlPlaneCompleteLeaseInput,
  ControlPlaneEnqueueWebRunInput,
  ControlPlaneHeartbeatAgentInput,
  ControlPlaneHeartbeatLeaseInput,
  ControlPlanePrincipal,
  ControlPlaneServer,
  ControlPlaneStore,
  JobEventsResponse,
} from '../types.js';
import { createControlPlaneStoreFromEnv } from './create-control-plane-store.js';
import { PaginationError, parseLimit } from './pagination.js';
import { createArtifactBlobStoreFromEnv } from './artifact-blob-store.js';
import { readBearerToken, verifyControlPlaneJwt } from './auth.js';
import {
  buildDecision,
  isAcquireLeaseRequest,
  isAppendRecordingEventsRequest,
  isArtifactDownloadMode,
  isBindDefaultDatasetRequest,
  isCompleteLeaseRequest,
  isCreateRecordingRequest,
  isDatasetRowCreateRequest,
  isDatasetRowPatchRequest,
  isEnqueueWebRunRequest,
  isExtractTestCaseRequest,
  isHeartbeatAgentRequest,
  isHeartbeatLeaseRequest,
  isPublishRecordingRequest,
  isRegisterAgentRequest,
  isRunCreateRequest,
  isRunnerResultEnvelope,
  isStepControlRequest,
  isStepOverrideRequest,
  isTestCaseCreateRequest,
  isTestCasePatchRequest,
  isTestCaseVersionCreateRequest,
  normalizeAcquireLease,
  normalizeCreateRecordingRequest,
  normalizeDatasetRowCreateRequest,
  normalizeDatasetRowPatchRequest,
  normalizeEnqueueWebRun,
  normalizeExtractTestCaseRequest,
  normalizeHeartbeatAgent,
  normalizeHeartbeatLease,
  normalizePublishRecordingRequest,
  normalizeRecordingEventRequests,
  normalizeRegisterAgent,
  normalizeRunExecutionPolicy,
  normalizeTestCaseCreateRequest,
  normalizeTestCasePatchRequest,
  normalizeTestCaseVersionCreateRequest,
  readJson,
} from './control-plane-api-requests.js';
import {
  toApiAgent,
  toApiArtifact,
  toApiDataTemplateVersion,
  toApiDatasetRow,
  toApiDerivedTestCaseBundle,
  toApiLease,
  toApiPrincipal,
  toApiRecording,
  toApiRecordingAnalysisJob,
  toApiRun,
  toApiRunItem,
  toApiStepEvent,
  toApiTestCase,
  toApiTestCaseBundle,
  toApiTestCaseVersion,
  toPaginatedPayload,
} from './control-plane-api-responses.js';
import { ControlPlaneRequestError } from './test-assets.js';

const json = (response: ServerResponse, status: number, payload?: unknown): void => {
  if (payload === undefined) {
    response.writeHead(status);
    response.end();
    return;
  }

  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(payload));
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const matchPath = (pathname: string, expression: RegExp): RegExpMatchArray | null => pathname.match(expression);

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

      if (method === 'POST' && pathname === '/api/v1/recordings') {
        const principal = await authenticatePrincipal(request, response);
        if (!principal) {
          return;
        }
        if (!store.createRecording) {
          notSupported(response, 'create recording');
          return;
        }

        const body = await readJson<unknown>(request);
        if (!isCreateRecordingRequest(body)) {
          json(response, 400, {
            error: {
              code: 'INVALID_RECORDING_CREATE_REQUEST',
              message: 'tenant_id, project_id, name, source_type and env_profile are required',
              trace_id: 'local',
            },
          });
          return;
        }

        const input = normalizeCreateRecordingRequest(body as Record<string, unknown>);
        if (input.tenantId !== principal.tenantId) {
          forbidden(response, 'TENANT_SCOPE_MISMATCH', 'tenant_id must match authenticated principal');
          return;
        }
        if (!canAccessProject(principal, input.projectId)) {
          forbidden(response, 'PROJECT_ACCESS_DENIED', 'project_id is not granted to the principal');
          return;
        }

        const recording = await store.createRecording(input, { subjectId: principal.subjectId });
        json(response, 201, toApiRecording(recording));
        return;
      }

      const recordingMatch = matchPath(pathname, /^\/api\/v1\/recordings\/([^/:]+)$/);
      if (method === 'GET' && recordingMatch) {
        const principal = await authenticatePrincipal(request, response);
        if (!principal) {
          return;
        }
        if (!store.getRecording) {
          notSupported(response, 'get recording');
          return;
        }

        const [, recordingId] = recordingMatch;
        const recording = await store.getRecording(recordingId);
        if (!recording) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'recording not found', trace_id: 'local' } });
          return;
        }
        if (recording.tenantId !== principal.tenantId) {
          forbidden(response, 'TENANT_SCOPE_MISMATCH', 'recording tenant_id must match authenticated principal');
          return;
        }
        if (!canAccessProject(principal, recording.projectId)) {
          forbidden(response, 'PROJECT_ACCESS_DENIED', 'recording project_id is not granted to the principal');
          return;
        }

        json(response, 200, toApiRecording(recording));
        return;
      }

      const recordingEventsMatch = matchPath(pathname, /^\/api\/v1\/recordings\/([^/:]+)\/events$/);
      if (method === 'POST' && recordingEventsMatch) {
        const principal = await authenticatePrincipal(request, response);
        if (!principal) {
          return;
        }
        if (!store.getRecording || !store.appendRecordingEvents) {
          notSupported(response, 'append recording events');
          return;
        }

        const [, recordingId] = recordingEventsMatch;
        const recording = await store.getRecording(recordingId);
        if (!recording) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'recording not found', trace_id: 'local' } });
          return;
        }
        if (recording.tenantId !== principal.tenantId) {
          forbidden(response, 'TENANT_SCOPE_MISMATCH', 'recording tenant_id must match authenticated principal');
          return;
        }
        if (!canAccessProject(principal, recording.projectId)) {
          forbidden(response, 'PROJECT_ACCESS_DENIED', 'recording project_id is not granted to the principal');
          return;
        }

        const body = await readJson<unknown>(request);
        if (!isAppendRecordingEventsRequest(body)) {
          json(response, 400, {
            error: {
              code: 'INVALID_RECORDING_EVENTS_REQUEST',
              message: 'events must be a non-empty array of recording events',
              trace_id: 'local',
            },
          });
          return;
        }

        const appended = await store.appendRecordingEvents(
          recordingId,
          normalizeRecordingEventRequests(body as Record<string, unknown>),
          { subjectId: principal.subjectId },
        );
        if (!appended) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'recording not found', trace_id: 'local' } });
          return;
        }
        json(response, 201, {
          recording: toApiRecording(appended.recording),
          appended_count: appended.appendedCount,
        });
        return;
      }

      const analyzeRecordingMatch = matchPath(pathname, /^\/api\/v1\/recordings\/([^/:]+):analyze-dsl$/);
      if (method === 'POST' && analyzeRecordingMatch) {
        const principal = await authenticatePrincipal(request, response);
        if (!principal) {
          return;
        }
        if (!store.getRecording || !store.analyzeRecordingDsl) {
          notSupported(response, 'analyze recording dsl');
          return;
        }

        const [, recordingId] = analyzeRecordingMatch;
        const recording = await store.getRecording(recordingId);
        if (!recording) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'recording not found', trace_id: 'local' } });
          return;
        }
        if (recording.tenantId !== principal.tenantId) {
          forbidden(response, 'TENANT_SCOPE_MISMATCH', 'recording tenant_id must match authenticated principal');
          return;
        }
        if (!canAccessProject(principal, recording.projectId)) {
          forbidden(response, 'PROJECT_ACCESS_DENIED', 'recording project_id is not granted to the principal');
          return;
        }

        const analysisJob = await store.analyzeRecordingDsl(recordingId, { subjectId: principal.subjectId });
        if (!analysisJob) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'recording not found', trace_id: 'local' } });
          return;
        }
        json(response, 201, toApiRecordingAnalysisJob(analysisJob));
        return;
      }

      const publishRecordingMatch = matchPath(pathname, /^\/api\/v1\/recordings\/([^/:]+):publish-test-case$/);
      if (method === 'POST' && publishRecordingMatch) {
        const principal = await authenticatePrincipal(request, response);
        if (!principal) {
          return;
        }
        if (!store.getRecording || !store.publishRecordingAsTestCase) {
          notSupported(response, 'publish recording as test case');
          return;
        }

        const [, recordingId] = publishRecordingMatch;
        const recording = await store.getRecording(recordingId);
        if (!recording) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'recording not found', trace_id: 'local' } });
          return;
        }
        if (recording.tenantId !== principal.tenantId) {
          forbidden(response, 'TENANT_SCOPE_MISMATCH', 'recording tenant_id must match authenticated principal');
          return;
        }
        if (!canAccessProject(principal, recording.projectId)) {
          forbidden(response, 'PROJECT_ACCESS_DENIED', 'recording project_id is not granted to the principal');
          return;
        }

        const body = await readJson<unknown>(request);
        if (!isPublishRecordingRequest(body)) {
          json(response, 400, {
            error: {
              code: 'INVALID_RECORDING_PUBLISH_REQUEST',
              message: 'recording publish payload is invalid',
              trace_id: 'local',
            },
          });
          return;
        }

        const created = await store.publishRecordingAsTestCase(
          recordingId,
          normalizePublishRecordingRequest(body as Record<string, unknown>),
          { subjectId: principal.subjectId },
        );
        if (!created) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'recording not found', trace_id: 'local' } });
          return;
        }
        json(response, 201, toApiTestCaseBundle(
          created.testCase,
          created.version,
          created.dataTemplateVersion,
          created.defaultDatasetRow,
        ));
        return;
      }

      if (method === 'POST' && pathname === '/api/v1/test-cases') {
        const principal = await authenticatePrincipal(request, response);
        if (!principal) {
          return;
        }
        if (!store.createTestCase) {
          notSupported(response, 'create test case');
          return;
        }

        const body = await readJson<unknown>(request);
        if (!isTestCaseCreateRequest(body)) {
          json(response, 400, {
            error: {
              code: 'INVALID_TEST_CASE_CREATE_REQUEST',
              message: 'tenant_id, project_id, name, plan and env_profile are required',
              trace_id: 'local',
            },
          });
          return;
        }

        const input = normalizeTestCaseCreateRequest(body as Record<string, unknown>);
        if (input.tenantId !== principal.tenantId) {
          forbidden(response, 'TENANT_SCOPE_MISMATCH', 'tenant_id must match authenticated principal');
          return;
        }
        if (!canAccessProject(principal, input.projectId)) {
          forbidden(response, 'PROJECT_ACCESS_DENIED', 'project_id is not granted to the principal');
          return;
        }

        const created = await store.createTestCase(input, { subjectId: principal.subjectId });
        json(response, 201, toApiTestCaseBundle(
          created.testCase,
          created.version,
          created.dataTemplateVersion,
          created.defaultDatasetRow,
        ));
        return;
      }

      if (method === 'GET' && pathname === '/api/v1/test-cases') {
        const principal = await authenticatePrincipal(request, response);
        if (!principal) {
          return;
        }
        if (!store.listTestCases) {
          notSupported(response, 'list test cases');
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

        const page = await store.listTestCases({
          tenantId,
          projectId,
          limit: parseLimit(url.searchParams.get('limit'), 50, 200),
          cursor: url.searchParams.get('cursor') ?? undefined,
        });
        json(response, 200, toPaginatedPayload(page, toApiTestCase));
        return;
      }

      const testCaseMatch = matchPath(pathname, /^\/api\/v1\/test-cases\/([^/]+)$/);
      if ((method === 'GET' || method === 'PATCH' || method === 'DELETE') && testCaseMatch) {
        const principal = await authenticatePrincipal(request, response);
        if (!principal) {
          return;
        }
        if (!store.getTestCase) {
          notSupported(response, 'get test case');
          return;
        }

        const [, testCaseId] = testCaseMatch;
        const testCase = await store.getTestCase(testCaseId);
        if (!testCase) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'test case not found', trace_id: 'local' } });
          return;
        }
        if (testCase.tenantId !== principal.tenantId) {
          forbidden(response, 'TENANT_SCOPE_MISMATCH', 'test case tenant_id must match authenticated principal');
          return;
        }
        if (!canAccessProject(principal, testCase.projectId)) {
          forbidden(response, 'PROJECT_ACCESS_DENIED', 'test case project_id is not granted to the principal');
          return;
        }

        if (method === 'GET') {
          json(response, 200, toApiTestCase(testCase));
          return;
        }

        if (method === 'PATCH') {
          if (!store.updateTestCase) {
            notSupported(response, 'update test case');
            return;
          }

          const body = await readJson<unknown>(request);
          if (!isTestCasePatchRequest(body)) {
            json(response, 400, {
              error: {
                code: 'INVALID_TEST_CASE_PATCH_REQUEST',
                message: 'name and status must be valid when provided',
                trace_id: 'local',
              },
            });
            return;
          }

          const updated = await store.updateTestCase(
            testCaseId,
            normalizeTestCasePatchRequest(body as Record<string, unknown>),
            { subjectId: principal.subjectId },
          );
          if (!updated) {
            json(response, 404, { error: { code: 'NOT_FOUND', message: 'test case not found', trace_id: 'local' } });
            return;
          }
          json(response, 200, toApiTestCase(updated));
          return;
        }

        if (!store.archiveTestCase) {
          notSupported(response, 'archive test case');
          return;
        }
        const archived = await store.archiveTestCase(testCaseId, { subjectId: principal.subjectId });
        if (!archived) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'test case not found', trace_id: 'local' } });
          return;
        }
        json(response, 200, toApiTestCase(archived));
        return;
      }

      const testCaseVersionsMatch = matchPath(pathname, /^\/api\/v1\/test-cases\/([^/]+)\/versions$/);
      if ((method === 'GET' || method === 'POST') && testCaseVersionsMatch) {
        const principal = await authenticatePrincipal(request, response);
        if (!principal) {
          return;
        }
        if (!store.getTestCase) {
          notSupported(response, 'get test case');
          return;
        }

        const [, testCaseId] = testCaseVersionsMatch;
        const testCase = await store.getTestCase(testCaseId);
        if (!testCase) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'test case not found', trace_id: 'local' } });
          return;
        }
        if (testCase.tenantId !== principal.tenantId) {
          forbidden(response, 'TENANT_SCOPE_MISMATCH', 'test case tenant_id must match authenticated principal');
          return;
        }
        if (!canAccessProject(principal, testCase.projectId)) {
          forbidden(response, 'PROJECT_ACCESS_DENIED', 'test case project_id is not granted to the principal');
          return;
        }

        if (method === 'GET') {
          if (!store.listTestCaseVersions) {
            notSupported(response, 'list test case versions');
            return;
          }
          const page = await store.listTestCaseVersions({
            testCaseId,
            limit: parseLimit(url.searchParams.get('limit'), 50, 200),
            cursor: url.searchParams.get('cursor') ?? undefined,
          });
          json(response, 200, toPaginatedPayload(page, toApiTestCaseVersion));
          return;
        }

        if (!store.createTestCaseVersion) {
          notSupported(response, 'create test case version');
          return;
        }

        const body = await readJson<unknown>(request);
        if (!isTestCaseVersionCreateRequest(body)) {
          json(response, 400, {
            error: {
              code: 'INVALID_TEST_CASE_VERSION_CREATE_REQUEST',
              message: 'plan and env_profile are required',
              trace_id: 'local',
            },
          });
          return;
        }

        const created = await store.createTestCaseVersion(
          testCaseId,
          normalizeTestCaseVersionCreateRequest(body as Record<string, unknown>),
          { subjectId: principal.subjectId },
        );
        if (!created) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'test case not found', trace_id: 'local' } });
          return;
        }
        json(response, 201, toApiTestCaseBundle(
          created.testCase,
          created.version,
          created.dataTemplateVersion,
          created.defaultDatasetRow,
        ));
        return;
      }

      const testCaseVersionMatch = matchPath(pathname, /^\/api\/v1\/test-case-versions\/([^/]+)$/);
      if (method === 'GET' && testCaseVersionMatch) {
        const principal = await authenticatePrincipal(request, response);
        if (!principal) {
          return;
        }
        if (!store.getTestCaseVersion) {
          notSupported(response, 'get test case version');
          return;
        }

        const [, testCaseVersionId] = testCaseVersionMatch;
        const version = await store.getTestCaseVersion(testCaseVersionId);
        if (!version) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'test case version not found', trace_id: 'local' } });
          return;
        }
        if (version.tenantId !== principal.tenantId) {
          forbidden(response, 'TENANT_SCOPE_MISMATCH', 'test case version tenant_id must match authenticated principal');
          return;
        }
        if (!canAccessProject(principal, version.projectId)) {
          forbidden(response, 'PROJECT_ACCESS_DENIED', 'test case version project_id is not granted to the principal');
          return;
        }

        json(response, 200, toApiTestCaseVersion(version));
        return;
      }

      const publishTestCaseVersionMatch = matchPath(pathname, /^\/api\/v1\/test-case-versions\/([^/]+):publish$/);
      if (method === 'POST' && publishTestCaseVersionMatch) {
        const principal = await authenticatePrincipal(request, response);
        if (!principal) {
          return;
        }
        if (!store.getTestCaseVersion || !store.publishTestCaseVersion) {
          notSupported(response, 'publish test case version');
          return;
        }

        const [, testCaseVersionId] = publishTestCaseVersionMatch;
        const existing = await store.getTestCaseVersion(testCaseVersionId);
        if (!existing) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'test case version not found', trace_id: 'local' } });
          return;
        }
        if (existing.tenantId !== principal.tenantId) {
          forbidden(response, 'TENANT_SCOPE_MISMATCH', 'test case version tenant_id must match authenticated principal');
          return;
        }
        if (!canAccessProject(principal, existing.projectId)) {
          forbidden(response, 'PROJECT_ACCESS_DENIED', 'test case version project_id is not granted to the principal');
          return;
        }

        const version = await store.publishTestCaseVersion(testCaseVersionId, { subjectId: principal.subjectId });
        if (!version) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'test case version not found', trace_id: 'local' } });
          return;
        }
        json(response, 200, toApiTestCaseVersion(version));
        return;
      }

      const dataTemplateMatch = matchPath(pathname, /^\/api\/v1\/test-case-versions\/([^/]+)\/data-template$/);
      if (method === 'GET' && dataTemplateMatch) {
        const principal = await authenticatePrincipal(request, response);
        if (!principal) {
          return;
        }
        if (!store.getTestCaseVersion || !store.getDataTemplateForCaseVersion) {
          notSupported(response, 'get case version data template');
          return;
        }

        const [, testCaseVersionId] = dataTemplateMatch;
        const version = await store.getTestCaseVersion(testCaseVersionId);
        if (!version) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'test case version not found', trace_id: 'local' } });
          return;
        }
        if (version.tenantId !== principal.tenantId) {
          forbidden(response, 'TENANT_SCOPE_MISMATCH', 'test case version tenant_id must match authenticated principal');
          return;
        }
        if (!canAccessProject(principal, version.projectId)) {
          forbidden(response, 'PROJECT_ACCESS_DENIED', 'test case version project_id is not granted to the principal');
          return;
        }

        const template = await store.getDataTemplateForCaseVersion(testCaseVersionId);
        if (!template) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'data template not found', trace_id: 'local' } });
          return;
        }
        json(response, 200, toApiDataTemplateVersion(template));
        return;
      }

      const datasetRowsMatch = matchPath(pathname, /^\/api\/v1\/test-case-versions\/([^/]+)\/dataset-rows$/);
      if ((method === 'GET' || method === 'POST') && datasetRowsMatch) {
        const principal = await authenticatePrincipal(request, response);
        if (!principal) {
          return;
        }
        if (!store.getTestCaseVersion) {
          notSupported(response, 'get test case version');
          return;
        }

        const [, testCaseVersionId] = datasetRowsMatch;
        const version = await store.getTestCaseVersion(testCaseVersionId);
        if (!version) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'test case version not found', trace_id: 'local' } });
          return;
        }
        if (version.tenantId !== principal.tenantId) {
          forbidden(response, 'TENANT_SCOPE_MISMATCH', 'test case version tenant_id must match authenticated principal');
          return;
        }
        if (!canAccessProject(principal, version.projectId)) {
          forbidden(response, 'PROJECT_ACCESS_DENIED', 'test case version project_id is not granted to the principal');
          return;
        }

        if (method === 'GET') {
          if (!store.listDatasetRows) {
            notSupported(response, 'list dataset rows');
            return;
          }
          const page = await store.listDatasetRows({
            testCaseVersionId,
            limit: parseLimit(url.searchParams.get('limit'), 50, 200),
            cursor: url.searchParams.get('cursor') ?? undefined,
          });
          json(response, 200, toPaginatedPayload(page, toApiDatasetRow));
          return;
        }

        if (!store.createDatasetRow) {
          notSupported(response, 'create dataset row');
          return;
        }
        const body = await readJson<unknown>(request);
        if (!isDatasetRowCreateRequest(body)) {
          json(response, 400, {
            error: {
              code: 'INVALID_DATASET_ROW_CREATE_REQUEST',
              message: 'values is required',
              trace_id: 'local',
            },
          });
          return;
        }

        const datasetRow = await store.createDatasetRow(
          testCaseVersionId,
          normalizeDatasetRowCreateRequest(body as Record<string, unknown>),
          { subjectId: principal.subjectId },
        );
        if (!datasetRow) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'test case version not found', trace_id: 'local' } });
          return;
        }
        json(response, 201, toApiDatasetRow(datasetRow));
        return;
      }

      const bindDefaultDatasetMatch = matchPath(pathname, /^\/api\/v1\/test-case-versions\/([^/]+):bind-default-dataset$/);
      if (method === 'POST' && bindDefaultDatasetMatch) {
        const principal = await authenticatePrincipal(request, response);
        if (!principal) {
          return;
        }
        if (!store.getTestCaseVersion || !store.bindDefaultDatasetRow) {
          notSupported(response, 'bind default dataset row');
          return;
        }

        const [, testCaseVersionId] = bindDefaultDatasetMatch;
        const version = await store.getTestCaseVersion(testCaseVersionId);
        if (!version) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'test case version not found', trace_id: 'local' } });
          return;
        }
        if (version.tenantId !== principal.tenantId) {
          forbidden(response, 'TENANT_SCOPE_MISMATCH', 'test case version tenant_id must match authenticated principal');
          return;
        }
        if (!canAccessProject(principal, version.projectId)) {
          forbidden(response, 'PROJECT_ACCESS_DENIED', 'test case version project_id is not granted to the principal');
          return;
        }

        const body = await readJson<unknown>(request);
        if (!isBindDefaultDatasetRequest(body)) {
          json(response, 400, {
            error: {
              code: 'INVALID_BIND_DEFAULT_DATASET_REQUEST',
              message: 'dataset_row_id is required',
              trace_id: 'local',
            },
          });
          return;
        }

        const updated = await store.bindDefaultDatasetRow(
          testCaseVersionId,
          String((body as Record<string, unknown>).datasetRowId ?? (body as Record<string, unknown>).dataset_row_id),
          { subjectId: principal.subjectId },
        );
        if (!updated) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'test case version not found', trace_id: 'local' } });
          return;
        }
        json(response, 200, toApiTestCaseVersion(updated));
        return;
      }

      const datasetRowMatch = matchPath(pathname, /^\/api\/v1\/dataset-rows\/([^/]+)$/);
      if ((method === 'PATCH' || method === 'DELETE') && datasetRowMatch) {
        const principal = await authenticatePrincipal(request, response);
        if (!principal) {
          return;
        }
        if (!store.getDatasetRow) {
          notSupported(response, 'get dataset row');
          return;
        }

        const [, datasetRowId] = datasetRowMatch;
        const datasetRow = await store.getDatasetRow(datasetRowId);
        if (!datasetRow) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'dataset row not found', trace_id: 'local' } });
          return;
        }
        if (datasetRow.tenantId !== principal.tenantId) {
          forbidden(response, 'TENANT_SCOPE_MISMATCH', 'dataset row tenant_id must match authenticated principal');
          return;
        }
        if (!canAccessProject(principal, datasetRow.projectId)) {
          forbidden(response, 'PROJECT_ACCESS_DENIED', 'dataset row project_id is not granted to the principal');
          return;
        }

        if (method === 'PATCH') {
          if (!store.updateDatasetRow) {
            notSupported(response, 'update dataset row');
            return;
          }

          const body = await readJson<unknown>(request);
          if (!isDatasetRowPatchRequest(body)) {
            json(response, 400, {
              error: {
                code: 'INVALID_DATASET_ROW_PATCH_REQUEST',
                message: 'values and name must be valid when provided',
                trace_id: 'local',
              },
            });
            return;
          }

          const updated = await store.updateDatasetRow(
            datasetRowId,
            normalizeDatasetRowPatchRequest(body as Record<string, unknown>),
            { subjectId: principal.subjectId },
          );
          if (!updated) {
            json(response, 404, { error: { code: 'NOT_FOUND', message: 'dataset row not found', trace_id: 'local' } });
            return;
          }
          json(response, 200, toApiDatasetRow(updated));
          return;
        }

        if (!store.archiveDatasetRow) {
          notSupported(response, 'archive dataset row');
          return;
        }
        const archived = await store.archiveDatasetRow(datasetRowId, { subjectId: principal.subjectId });
        if (!archived) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'dataset row not found', trace_id: 'local' } });
          return;
        }
        json(response, 200, toApiDatasetRow(archived));
        return;
      }

      if (method === 'POST' && pathname === '/api/v1/runs') {
        const principal = await authenticatePrincipal(request, response);
        if (!principal) {
          return;
        }

        const body = await readJson<unknown>(request);
        if (!isRunCreateRequest(body)) {
          json(response, 400, {
            error: {
              code: 'INVALID_RUN_CREATE_REQUEST',
              message: 'tenant_id, project_id, name, mode and selection are required',
              trace_id: 'local',
            },
          });
          return;
        }

        const payload = body as Record<string, unknown>;
        const baseInput = normalizeRunExecutionPolicy(payload);
        if (baseInput.tenantId !== principal.tenantId) {
          forbidden(response, 'TENANT_SCOPE_MISMATCH', 'tenant_id must match authenticated principal');
          return;
        }
        if (!canAccessProject(principal, baseInput.projectId)) {
          forbidden(response, 'PROJECT_ACCESS_DENIED', 'project_id is not granted to the principal');
          return;
        }

        const selection = payload.selection as Record<string, unknown>;
        if (selection.kind === 'case_version') {
          if (!store.enqueueCaseVersionRun) {
            notSupported(response, 'create case version run');
            return;
          }
          const queued = await store.enqueueCaseVersionRun({
            ...baseInput,
            testCaseVersionId: String(selection.testCaseVersionId ?? selection.test_case_version_id),
            datasetRowId: typeof (selection.datasetRowId ?? selection.dataset_row_id) === 'string'
              ? String(selection.datasetRowId ?? selection.dataset_row_id)
              : undefined,
          });
          json(response, 201, toApiRun(queued.run));
          return;
        }

        if (!store.enqueueWebRun) {
          notSupported(response, 'create run');
          return;
        }
        const queued = await store.enqueueWebRun({
          ...baseInput,
          plan: selection.plan as ControlPlaneEnqueueWebRunInput['plan'],
          envProfile: (selection.envProfile ?? selection.env_profile) as ControlPlaneEnqueueWebRunInput['envProfile'],
        });
        json(response, 201, toApiRun(queued.run));
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

      const extractRunItemMatch = matchPath(pathname, /^\/api\/v1\/run-items\/([^/:]+):extract-test-case$/);
      if (method === 'POST' && extractRunItemMatch) {
        const principal = await authenticatePrincipal(request, response);
        if (!principal) {
          return;
        }
        if (!store.getRunItem || !store.extractTestCaseFromRunItem) {
          notSupported(response, 'extract test case from run item');
          return;
        }

        const [, runItemId] = extractRunItemMatch;
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

        const body = await readJson<unknown>(request);
        if (!isExtractTestCaseRequest(body)) {
          json(response, 400, {
            error: {
              code: 'INVALID_EXTRACT_TEST_CASE_REQUEST',
              message: 'extract test case payload is invalid',
              trace_id: 'local',
            },
          });
          return;
        }

        const derived = await store.extractTestCaseFromRunItem(
          runItemId,
          normalizeExtractTestCaseRequest(body as Record<string, unknown>),
          { subjectId: principal.subjectId },
        );
        if (!derived) {
          json(response, 404, { error: { code: 'NOT_FOUND', message: 'run item not found', trace_id: 'local' } });
          return;
        }
        json(response, 201, toApiDerivedTestCaseBundle(derived));
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

      if (error instanceof ControlPlaneRequestError) {
        json(response, error.status, {
          error: {
            code: error.code,
            message: error.message,
            trace_id: 'local',
          },
        });
        return;
      }

      console.error(error);
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
