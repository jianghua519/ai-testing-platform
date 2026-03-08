import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { signControlPlaneJwt } from '@aiwtp/control-plane';

import type { ConsoleConfig } from './config.js';
import {
  ConsoleStore,
  type ArtifactSummary,
  type DatasetRowSummary,
  type ExplorationDetail,
  type ExplorationListItem,
  type OverviewData,
  type PageResult,
  type ProjectScope,
  type RecordingDetail,
  type RecordingListItem,
  type RunDetail,
  type RunListItem,
  type SystemStatus,
  type TestCaseDetail,
  type TestCaseListItem,
  type ThreadDetail,
  type ThreadListItem,
} from './store.js';

export interface ConsoleServer {
  baseUrl: string;
  close(): Promise<void>;
}

const DEFAULT_ENV_PROFILE = {
  profileId: 'dev',
  browserProfile: {
    browser: 'chromium',
    headless: true,
    viewport: {
      width: 1440,
      height: 900,
    },
  },
};

const DEFAULT_PLAN = {
  planId: 'console-sample-plan',
  planName: 'Console sample flow',
  version: 'v1',
  browserProfile: DEFAULT_ENV_PROFILE.browserProfile,
  steps: [
    {
      stepId: 'open-home',
      name: '打开首页',
      kind: 'navigation',
      action: 'open',
      input: {
        source: 'literal',
        value: 'https://example.com/home',
      },
    },
  ],
};

const STYLES = `
  :root {
    --bg: #f5efe2;
    --bg-warm: #ebe1c6;
    --panel: rgba(255, 251, 244, 0.9);
    --panel-strong: #fffaf2;
    --line: rgba(30, 46, 56, 0.14);
    --ink: #10222f;
    --muted: #5b6d77;
    --accent: #0f766e;
    --accent-soft: rgba(15, 118, 110, 0.12);
    --warning: #9a3412;
    --warning-soft: rgba(154, 52, 18, 0.1);
    --nav: #16323f;
    --nav-soft: rgba(22, 50, 63, 0.88);
    --shadow: 0 24px 50px rgba(16, 34, 47, 0.12);
    --radius: 22px;
    --radius-small: 14px;
    --mono: "SFMono-Regular", "Cascadia Code", "JetBrains Mono", monospace;
    --sans: "Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif;
    --display: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: var(--ink);
    background:
      radial-gradient(circle at top left, rgba(15, 118, 110, 0.08), transparent 30%),
      radial-gradient(circle at top right, rgba(191, 90, 36, 0.12), transparent 26%),
      linear-gradient(180deg, var(--bg) 0%, var(--bg-warm) 100%);
    font-family: var(--sans);
  }

  a { color: inherit; text-decoration: none; }

  .shell {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 270px minmax(0, 1fr);
  }

  .sidebar {
    background: linear-gradient(180deg, var(--nav) 0%, #1b4657 100%);
    color: #f6efe1;
    padding: 28px 22px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .logo {
    font-family: var(--display);
    font-size: 31px;
    letter-spacing: 0.02em;
    line-height: 1;
  }

  .sublogo {
    color: rgba(246, 239, 225, 0.72);
    font-size: 13px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .nav-group {
    display: grid;
    gap: 10px;
  }

  .nav-link {
    padding: 14px 16px;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.82);
    background: rgba(255, 255, 255, 0.03);
  }

  .nav-link.active {
    color: white;
    background: rgba(255, 250, 242, 0.14);
    border-color: rgba(255, 250, 242, 0.22);
  }

  .sidebar-foot {
    margin-top: auto;
    display: grid;
    gap: 14px;
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 13px;
    color: rgba(255, 255, 255, 0.72);
  }

  .main {
    padding: 24px;
    display: grid;
    gap: 18px;
  }

  .topbar, .page {
    background: var(--panel);
    border: 1px solid rgba(255, 255, 255, 0.56);
    box-shadow: var(--shadow);
    backdrop-filter: blur(18px);
  }

  .topbar {
    border-radius: 24px;
    padding: 18px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    flex-wrap: wrap;
  }

  .scope-form, .header-actions, .filters {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }

  .topbar-meta {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
  }

  .page {
    border-radius: 28px;
    padding: 24px;
    display: grid;
    gap: 20px;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
    flex-wrap: wrap;
  }

  h1, h2, h3 {
    margin: 0;
    font-family: var(--display);
    font-weight: 600;
  }

  h1 { font-size: 40px; }
  h2 { font-size: 24px; }
  h3 { font-size: 18px; }

  .subtitle {
    color: var(--muted);
    margin-top: 8px;
    max-width: 68ch;
    line-height: 1.55;
  }

  .button, button, select, input, textarea {
    font: inherit;
  }

  .button, button {
    border: 0;
    border-radius: 999px;
    padding: 10px 16px;
    cursor: pointer;
    background: var(--accent);
    color: white;
  }

  .button.secondary, button.secondary {
    background: transparent;
    color: var(--ink);
    border: 1px solid var(--line);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    padding: 5px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    background: var(--accent-soft);
    color: var(--accent);
  }

  .badge.warning {
    background: var(--warning-soft);
    color: var(--warning);
  }

  .grid-4 {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }

  .grid-2 {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .stat, .card, .list, .detail, .flash {
    border-radius: var(--radius);
    background: var(--panel-strong);
    border: 1px solid var(--line);
  }

  .stat, .card, .detail {
    padding: 18px;
  }

  .stat-value {
    font-family: var(--display);
    font-size: 40px;
    line-height: 1;
    margin-top: 14px;
  }

  .meta {
    color: var(--muted);
    font-size: 13px;
  }

  .page-body {
    display: grid;
    grid-template-columns: 360px minmax(0, 1fr);
    gap: 18px;
    align-items: start;
  }

  .list {
    padding: 14px;
    display: grid;
    gap: 10px;
  }

  .list-item {
    border-radius: 18px;
    padding: 14px;
    border: 1px solid transparent;
    background: rgba(245, 239, 226, 0.64);
    display: grid;
    gap: 8px;
  }

  .list-item.selected {
    border-color: rgba(15, 118, 110, 0.28);
    background: rgba(15, 118, 110, 0.09);
  }

  .detail {
    display: grid;
    gap: 16px;
  }

  .section {
    border-radius: 18px;
    border: 1px solid var(--line);
    padding: 16px;
    display: grid;
    gap: 12px;
  }

  .section-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .filters {
    padding: 16px;
    border-radius: 18px;
    background: rgba(255, 250, 242, 0.78);
    border: 1px solid var(--line);
  }

  input, select, textarea {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: white;
    padding: 10px 12px;
    color: var(--ink);
  }

  textarea {
    min-height: 120px;
    resize: vertical;
    font-family: var(--mono);
    font-size: 13px;
  }

  pre {
    margin: 0;
    padding: 12px;
    border-radius: 14px;
    background: #f4efe4;
    border: 1px solid rgba(16, 34, 47, 0.08);
    white-space: pre-wrap;
    word-break: break-word;
    font-family: var(--mono);
    font-size: 12px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  th, td {
    padding: 10px 8px;
    border-bottom: 1px solid var(--line);
    text-align: left;
    vertical-align: top;
  }

  th {
    color: var(--muted);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .inline-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }

  details.action-panel {
    border: 1px solid var(--line);
    border-radius: 18px;
    padding: 14px 16px;
    background: rgba(255, 250, 242, 0.88);
  }

  details.action-panel summary {
    cursor: pointer;
    font-weight: 700;
  }

  .flash {
    padding: 12px 16px;
  }

  .flash.notice { border-color: rgba(15, 118, 110, 0.24); }
  .flash.error { border-color: rgba(154, 52, 18, 0.28); background: #fff5f0; }

  .empty {
    padding: 18px;
    border-radius: 18px;
    border: 1px dashed var(--line);
    color: var(--muted);
  }

  .pagination {
    display: flex;
    gap: 8px;
    justify-content: space-between;
    align-items: center;
  }

  .mono { font-family: var(--mono); }

  @media (max-width: 1080px) {
    .shell { grid-template-columns: 1fr; }
    .sidebar { border-radius: 0 0 24px 24px; }
    .page-body { grid-template-columns: 1fr; }
    .grid-4, .grid-2 { grid-template-columns: 1fr; }
  }
`;

const escapeHtml = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const formatJson = (value: unknown): string => JSON.stringify(value, null, 2);

const formatCountSummary = (items: { value: string; count: number }[]): string => items.length
  ? items.map((item) => `${item.value} ${item.count}`).join(' · ')
  : 'No data';

const formatBytes = (value: number): string => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let amount = value;
  let unit = units[0];
  for (const next of units) {
    unit = next;
    if (amount < 1024 || next === units[units.length - 1]) {
      break;
    }
    amount /= 1024;
  }
  return `${amount.toFixed(amount >= 100 ? 0 : amount >= 10 ? 1 : 2)} ${unit}`;
};

const statusBadgeClass = (status: string): string => {
  const value = status.toLowerCase();
  if (['failed', 'error', 'archived', 'stopped', 'canceled'].includes(value)) {
    return 'badge warning';
  }
  return 'badge';
};

const stringifyValue = (value: string | null | undefined): string => escapeHtml(value ?? '—');

const getBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
};

const readForm = async (request: IncomingMessage): Promise<URLSearchParams> => new URLSearchParams(await getBody(request));

const sendHtml = (response: ServerResponse, statusCode: number, body: string): void => {
  response.writeHead(statusCode, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(body);
};

const sendJson = (response: ServerResponse, statusCode: number, body: unknown): void => {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
};

const redirect = (response: ServerResponse, location: string): void => {
  response.writeHead(303, { location });
  response.end();
};

const buildSearchParams = (params: Record<string, string | number | undefined | null>): URLSearchParams => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  return search;
};

const buildQueryString = (params: Record<string, string | number | undefined | null>): string => {
  const search = buildSearchParams(params);
  const query = search.toString();
  return query ? `?${query}` : '';
};

const safeRedirectTarget = (value: string | null, fallback: string): string => {
  if (!value?.startsWith('/')) {
    return fallback;
  }
  const url = new URL(value, 'http://console.local');
  url.searchParams.delete('notice');
  url.searchParams.delete('error');
  return `${url.pathname}${url.search}`;
};

const withFlash = (location: string, kind: 'notice' | 'error', message: string): string => {
  const url = new URL(location, 'http://console.local');
  url.searchParams.set(kind, message);
  return `${url.pathname}${url.search}`;
};

const hiddenInput = (name: string, value: string): string =>
  `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`;

const renderPagination = (result: PageResult<unknown>, basePath: string, params: URLSearchParams, pageKey = 'page'): string => {
  const previousParams = new URLSearchParams(params);
  previousParams.set(pageKey, String(Math.max(1, result.page - 1)));
  const nextParams = new URLSearchParams(params);
  nextParams.set(pageKey, String(result.page + 1));
  return `
    <div class="pagination">
      <div class="meta">Page ${result.page}</div>
      <div class="inline-actions">
        ${result.hasPrevious ? `<a class="button secondary" href="${escapeHtml(`${basePath}?${previousParams.toString()}`)}">Previous</a>` : ''}
        ${result.hasNext ? `<a class="button secondary" href="${escapeHtml(`${basePath}?${nextParams.toString()}`)}">Next</a>` : ''}
      </div>
    </div>
  `;
};

const renderFlash = (notice?: string | null, error?: string | null): string => {
  if (error) {
    return `<div class="flash error">${escapeHtml(error)}</div>`;
  }
  if (notice) {
    return `<div class="flash notice">${escapeHtml(notice)}</div>`;
  }
  return '';
};

const renderActionPanel = (title: string, body: string): string => `
  <details class="action-panel">
    <summary>${escapeHtml(title)}</summary>
    <div style="margin-top: 14px; display: grid; gap: 12px;">${body}</div>
  </details>
`;

const renderField = (label: string, value: string): string => `
  <div style="display:grid; gap:6px;">
    <div class="meta">${escapeHtml(label)}</div>
    <div>${value}</div>
  </div>
`;

const renderStatus = (status: string): string => `<span class="${statusBadgeClass(status)}">${escapeHtml(status)}</span>`;

const renderProjectSwitcher = (
  pathname: string,
  scopes: ProjectScope[],
  currentScope: ProjectScope | null,
): string => {
  const options = scopes.map((scope) => {
    const selected = currentScope && scope.tenantId === currentScope.tenantId && scope.projectId === currentScope.projectId
      ? ' selected'
      : '';
    return `<option value="${escapeHtml(`${scope.tenantId}::${scope.projectId}`)}"${selected}>${escapeHtml(scope.label)}</option>`;
  }).join('');
  return `
    <form class="scope-form" method="get" action="${escapeHtml(pathname)}">
      <label class="meta" for="scope">Project</label>
      <select id="scope" name="scope" onchange="this.form.submit()">
        ${options}
      </select>
    </form>
  `;
};

const renderLayout = (input: {
  currentNav: 'overview' | 'assets' | 'runs' | 'ai-workspace';
  pathname: string;
  scopes: ProjectScope[];
  currentScope: ProjectScope | null;
  systemStatus: SystemStatus | null;
  notice?: string | null;
  error?: string | null;
  pageHeader: string;
  pageBody: string;
}): string => {
  const scopeQuery = input.currentScope
    ? buildQueryString({ tenant_id: input.currentScope.tenantId, project_id: input.currentScope.projectId })
    : '';
  const navLink = (nav: typeof input.currentNav, href: string, label: string): string => `
    <a class="nav-link${nav === input.currentNav ? ' active' : ''}" href="${escapeHtml(`${href}${scopeQuery}`)}">${escapeHtml(label)}</a>
  `;

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>AIWTP Console</title>
    <style>${STYLES}</style>
  </head>
  <body>
    <div class="shell">
      <aside class="sidebar">
        <div>
          <div class="logo">AIWTP</div>
          <div class="sublogo">Console</div>
        </div>
        <nav class="nav-group">
          ${navLink('overview', '/overview', 'Overview')}
          ${navLink('assets', '/assets', 'Assets')}
          ${navLink('runs', '/runs', 'Runs')}
          ${navLink('ai-workspace', '/ai-workspace', 'AI Workspace')}
        </nav>
        <div class="sidebar-foot">
          <div>System Status</div>
          <div>${input.systemStatus ? `${input.systemStatus.onlineAgents} agents online · queue ${input.systemStatus.queuedItems}` : 'No project selected'}</div>
        </div>
      </aside>
      <main class="main">
        <div class="topbar">
          <div class="topbar-meta">
            ${input.scopes.length ? renderProjectSwitcher(input.pathname, input.scopes, input.currentScope) : '<div class="meta">No project scopes discovered yet.</div>'}
            ${input.currentScope ? `<span class="badge">${escapeHtml(input.currentScope.tenantId)}</span><span class="badge">${escapeHtml(input.currentScope.projectId)}</span>` : ''}
          </div>
        </div>
        ${renderFlash(input.notice, input.error)}
        <section class="page">
          ${input.pageHeader}
          ${input.pageBody}
        </section>
      </main>
    </div>
  </body>
</html>`;
};

interface RouteContext {
  config: ConsoleConfig;
  store: ConsoleStore;
  scopes: ProjectScope[];
  currentScope: ProjectScope | null;
}

const readScope = (url: URL, scopes: ProjectScope[]): ProjectScope | null => {
  const scopeParam = url.searchParams.get('scope');
  const tenantParam = url.searchParams.get('tenant_id');
  const projectParam = url.searchParams.get('project_id');
  const [tenantId, projectId] = scopeParam?.split('::', 2) ?? [tenantParam ?? undefined, projectParam ?? undefined];
  if (tenantId && projectId) {
    return scopes.find((scope) => scope.tenantId === tenantId && scope.projectId === projectId) ?? {
      tenantId,
      projectId,
      label: `${tenantId} / ${projectId}`,
    };
  }
  return scopes[0] ?? null;
};

const scopeParams = (scope: ProjectScope | null): Record<string, string | undefined> => ({
  tenant_id: scope?.tenantId,
  project_id: scope?.projectId,
});

class ConsoleApiClient {
  readonly #config: ConsoleConfig;
  readonly #store: ConsoleStore;

  constructor(config: ConsoleConfig, store: ConsoleStore) {
    this.#config = config;
    this.#store = store;
  }

  get defaultSubjectId(): string {
    return this.#config.defaultSubjectId;
  }

  async controlPlane(
    tenantId: string,
    projectId: string,
    pathname: string,
    options: { method?: string; body?: unknown } = {},
  ): Promise<unknown> {
    await this.#store.ensureProjectMembership(this.#config.defaultSubjectId, tenantId, projectId);
    const token = signControlPlaneJwt(
      { sub: this.#config.defaultSubjectId, tenant_id: tenantId },
      { CONTROL_PLANE_JWT_SECRET: this.#config.controlPlaneJwtSecret },
    );
    const response = await fetch(new URL(pathname, this.#config.controlPlaneBaseUrl), {
      method: options.method ?? 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        ...(options.body ? { 'content-type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message = payload?.error?.message ?? payload?.error?.code ?? payload?.error ?? response.statusText;
      throw new Error(`${options.method ?? 'GET'} ${pathname} failed: ${String(message)}`);
    }
    return payload;
  }

  async ai(pathname: string, options: { method?: string; body?: unknown } = {}): Promise<unknown> {
    const response = await fetch(new URL(pathname, this.#config.aiOrchestratorBaseUrl), {
      method: options.method ?? 'GET',
      headers: options.body ? { 'content-type': 'application/json' } : {},
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(`${options.method ?? 'GET'} ${pathname} failed: ${String(payload?.error ?? response.statusText)}`);
    }
    return payload;
  }
}

const renderOverviewPage = async (ctx: RouteContext, pathname: string, url: URL): Promise<string> => {
  const systemStatus = ctx.currentScope
    ? await ctx.store.getSystemStatus(ctx.currentScope.tenantId, ctx.currentScope.projectId)
    : null;
  const overview = ctx.currentScope
    ? await ctx.store.getOverview(ctx.currentScope.tenantId, ctx.currentScope.projectId)
    : null;
  const query = buildQueryString(scopeParams(ctx.currentScope));
  const pageHeader = `
    <div class="page-header">
      <div>
        <h1>Overview</h1>
        <div class="subtitle">Stored objects and evidence coverage for the current project.</div>
      </div>
      <div class="header-actions">
        <a class="button" href="${escapeHtml(`/runs${query}`)}">New Run</a>
        <a class="button secondary" href="${escapeHtml(`/ai-workspace${query}`)}">New Exploration</a>
      </div>
    </div>
  `;
  const pageBody = !ctx.currentScope || !overview
    ? `<div class="empty">Select a tenant/project pair after data exists in PostgreSQL.</div>`
    : `
      <div class="grid-4">
        ${renderStatCard('Test Cases', String(overview.testCaseCount), formatCountSummary(overview.testCaseStatuses))}
        ${renderStatCard('Recordings', String(overview.recordingCount), `${overview.recordingAnalysisCount} analysis jobs · ${formatCountSummary(overview.recordingAnalysisStatuses)}`)}
        ${renderStatCard('Runs', String(overview.runCount), `${overview.activeRunCount} active · ${overview.failedRunCount} failed`)}
        ${renderStatCard('AI Workspace', `${overview.threadCount} / ${overview.explorationCount}`, formatCountSummary(overview.explorationStatuses))}
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="section-head">
            <h2>Evidence Summary</h2>
            ${renderStatus(`${overview.artifactCount} artifacts`)}
          </div>
          <div class="grid-2">
            ${renderStatCard('Stored Bytes', formatBytes(overview.artifactBytes), 'Based on artifact metadata in PostgreSQL')}
            ${renderStatCard('Artifact Types', String(overview.artifactTypes.length), formatCountSummary(overview.artifactTypes))}
          </div>
        </div>
        <div class="card">
          <div class="section-head">
            <h2>Entry Points</h2>
            ${systemStatus ? `<span class="meta">${systemStatus.onlineAgents} agents online · queue ${systemStatus.queuedItems}</span>` : ''}
          </div>
          <div class="grid-2">
            <a class="list-item" href="${escapeHtml(`/assets${query}`)}"><strong>Assets</strong><span class="meta">Cases, recordings, datasets</span></a>
            <a class="list-item" href="${escapeHtml(`/runs${query}`)}"><strong>Runs</strong><span class="meta">Runs, items, step events, evidence</span></a>
            <a class="list-item" href="${escapeHtml(`/ai-workspace${query}`)}"><strong>AI Workspace</strong><span class="meta">Threads, explorations, memory, artifacts</span></a>
          </div>
        </div>
      </div>
    `;

  return renderLayout({
    currentNav: 'overview',
    pathname,
    scopes: ctx.scopes,
    currentScope: ctx.currentScope,
    systemStatus,
    notice: url.searchParams.get('notice'),
    error: url.searchParams.get('error'),
    pageHeader,
    pageBody,
  });
};

const renderStatCard = (title: string, value: string, meta: string): string => `
  <div class="stat">
    <div class="meta">${escapeHtml(title)}</div>
    <div class="stat-value">${escapeHtml(value)}</div>
    <div class="meta">${escapeHtml(meta)}</div>
  </div>
`;

const renderAssetsPage = async (ctx: RouteContext, pathname: string, url: URL): Promise<string> => {
  const systemStatus = ctx.currentScope
    ? await ctx.store.getSystemStatus(ctx.currentScope.tenantId, ctx.currentScope.projectId)
    : null;
  const assetType = url.searchParams.get('asset_type') === 'recordings' ? 'recordings' : 'test-cases';
  const listPage = Number(url.searchParams.get('page') ?? '1');
  const query = url.searchParams.get('query') ?? '';
  const status = url.searchParams.get('status') ?? 'all';
  const sourceType = url.searchParams.get('source_type') ?? 'all';
  const currentParams = buildSearchParams({
    ...scopeParams(ctx.currentScope),
    asset_type: assetType,
    query,
    status,
    ...(assetType === 'recordings' ? { source_type: sourceType } : {}),
    page: listPage,
  });

  const pageHeader = `
    <div class="page-header">
      <div>
        <h1>Assets</h1>
        <div class="subtitle">Test cases, recordings, versions, templates, dataset rows, and recording history.</div>
      </div>
      <div class="header-actions">
        ${renderNewAssetActions(ctx.currentScope, `${pathname}?${currentParams.toString()}`)}
      </div>
    </div>
  `;

  if (!ctx.currentScope) {
    return renderLayout({
      currentNav: 'assets',
      pathname,
      scopes: ctx.scopes,
      currentScope: ctx.currentScope,
      systemStatus,
      notice: url.searchParams.get('notice'),
      error: url.searchParams.get('error'),
      pageHeader,
      pageBody: '<div class="empty">No project selected.</div>',
    });
  }

  const listResult = assetType === 'recordings'
    ? await ctx.store.listRecordings(ctx.currentScope.tenantId, ctx.currentScope.projectId, { query, status, sourceType, page: listPage })
    : await ctx.store.listTestCases(ctx.currentScope.tenantId, ctx.currentScope.projectId, { query, status, page: listPage });

  const selectedId = url.searchParams.get('asset_id') ?? listResult.items[0]?.id ?? null;
  const detail = assetType === 'recordings' && selectedId
    ? await ctx.store.getRecordingDetail(ctx.currentScope.tenantId, selectedId)
    : assetType === 'test-cases' && selectedId
      ? await ctx.store.getTestCaseDetail(ctx.currentScope.tenantId, selectedId)
      : null;

  const filterForm = `
    <form class="filters" method="get" action="${escapeHtml(pathname)}">
      ${hiddenInput('tenant_id', ctx.currentScope.tenantId)}
      ${hiddenInput('project_id', ctx.currentScope.projectId)}
      <select name="asset_type">
        <option value="test-cases"${assetType === 'test-cases' ? ' selected' : ''}>Test Cases</option>
        <option value="recordings"${assetType === 'recordings' ? ' selected' : ''}>Recordings</option>
      </select>
      <input type="search" name="query" value="${escapeHtml(query)}" placeholder="Search by name or ID">
      <select name="status">
        ${renderOptions(status, ['all', 'draft', 'active', 'archived', 'queued', 'running', 'succeeded', 'failed', 'stopped'])}
      </select>
      ${assetType === 'recordings' ? `<select name="source_type">${renderOptions(sourceType, ['all', 'manual', 'auto_explore', 'run_replay'])}</select>` : ''}
      <button type="submit">Apply</button>
    </form>
  `;

  const listMarkup = assetType === 'recordings'
    ? renderRecordingList(pathname, currentParams, listResult as PageResult<RecordingListItem>, selectedId)
    : renderTestCaseList(pathname, currentParams, listResult as PageResult<TestCaseListItem>, selectedId);

  const detailMarkup = assetType === 'recordings'
    ? renderRecordingDetailCard(ctx.currentScope, pathname, currentParams, detail as RecordingDetail | null)
    : renderTestCaseDetailCard(ctx.currentScope, pathname, currentParams, detail as TestCaseDetail | null);

  return renderLayout({
    currentNav: 'assets',
    pathname,
    scopes: ctx.scopes,
    currentScope: ctx.currentScope,
    systemStatus,
    notice: url.searchParams.get('notice'),
    error: url.searchParams.get('error'),
    pageHeader,
    pageBody: `${filterForm}<div class="page-body"><div class="list">${listMarkup}</div><div class="detail">${detailMarkup}</div></div>`,
  });
};

const renderTestCaseList = (
  pathname: string,
  baseParams: URLSearchParams,
  listResult: PageResult<TestCaseListItem>,
  selectedId: string | null,
): string => {
  const items = listResult.items.map((item) => {
    const params = new URLSearchParams(baseParams);
    params.set('asset_id', item.id);
    return `
      <a class="list-item${item.id === selectedId ? ' selected' : ''}" href="${escapeHtml(`${pathname}?${params.toString()}`)}">
        <strong>${escapeHtml(item.name)}</strong>
        <div class="inline-actions">${renderStatus(item.status)}</div>
        <div class="meta mono">${escapeHtml(item.id)}</div>
        <div class="meta">latest ${escapeHtml(item.latestVersionId ?? '—')} · updated ${escapeHtml(item.updatedAt)}</div>
      </a>
    `;
  }).join('');
  return `${items || '<div class="empty">No test cases for current filter.</div>'}${renderPagination(listResult, pathname, baseParams)}`;
};

const renderRecordingList = (
  pathname: string,
  baseParams: URLSearchParams,
  listResult: PageResult<RecordingListItem>,
  selectedId: string | null,
): string => {
  const items = listResult.items.map((item) => {
    const params = new URLSearchParams(baseParams);
    params.set('asset_id', item.id);
    return `
      <a class="list-item${item.id === selectedId ? ' selected' : ''}" href="${escapeHtml(`${pathname}?${params.toString()}`)}">
        <strong>${escapeHtml(item.name)}</strong>
        <div class="inline-actions">${renderStatus(item.status)}<span class="badge">${escapeHtml(item.sourceType)}</span></div>
        <div class="meta mono">${escapeHtml(item.id)}</div>
        <div class="meta">updated ${escapeHtml(item.updatedAt)}</div>
      </a>
    `;
  }).join('');
  return `${items || '<div class="empty">No recordings for current filter.</div>'}${renderPagination(listResult, pathname, baseParams)}`;
};

const renderTestCaseDetailCard = (
  scope: ProjectScope,
  pathname: string,
  params: URLSearchParams,
  detail: TestCaseDetail | null,
): string => {
  if (!detail) {
    return '<div class="empty">Select a test case to view details.</div>';
  }
  const returnTo = `${pathname}?${params.toString()}&asset_id=${encodeURIComponent(detail.id)}`;
  const latestVersion = detail.versions[0] ?? null;
  const versionRows = detail.versions.length
    ? `
      <table>
        <thead><tr><th>Version</th><th>Status</th><th>Source</th><th>Created</th><th></th></tr></thead>
        <tbody>
          ${detail.versions.map((version) => `
            <tr>
              <td>v${version.versionNo}${version.versionLabel ? ` · ${escapeHtml(version.versionLabel)}` : ''}</td>
              <td>${renderStatus(version.status)}</td>
              <td class="mono">${escapeHtml(version.sourceRecordingId ?? version.sourceRunId ?? 'manual')}</td>
              <td>${escapeHtml(version.createdAt)}</td>
              <td>
                <form method="post" action="/actions/test-case-versions/publish">
                  ${hiddenInput('tenant_id', scope.tenantId)}
                  ${hiddenInput('project_id', scope.projectId)}
                  ${hiddenInput('version_id', version.id)}
                  ${hiddenInput('return_to', returnTo)}
                  <button class="secondary" type="submit">Publish</button>
                </form>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    : '<div class="empty">No versions yet.</div>';
  const datasetRows = detail.datasetRows.length
    ? detail.datasetRows.map((row) => `
      <details class="action-panel">
        <summary>${escapeHtml(row.name)} · ${escapeHtml(row.status)}</summary>
        <form method="post" action="/actions/dataset-rows/update" style="display:grid; gap:10px; margin-top:12px;">
          ${hiddenInput('tenant_id', scope.tenantId)}
          ${hiddenInput('project_id', scope.projectId)}
          ${hiddenInput('dataset_row_id', row.id)}
          ${hiddenInput('return_to', returnTo)}
          <input name="name" value="${escapeHtml(row.name)}">
          <textarea name="values_json">${escapeHtml(formatJson(row.values))}</textarea>
          <button type="submit">Save Dataset Row</button>
        </form>
      </details>
    `).join('')
    : '<div class="empty">No dataset rows on latest version.</div>';

  return `
    <div class="section">
      <div class="section-head">
        <h2>${escapeHtml(detail.name)}</h2>
        <div class="inline-actions">${renderStatus(detail.status)}<span class="badge mono">${escapeHtml(detail.id)}</span></div>
      </div>
      <div class="grid-2">
        ${renderField('Latest Version', escapeHtml(detail.latestVersionId ?? '—'))}
        ${renderField('Latest Published Version', escapeHtml(detail.latestPublishedVersionId ?? '—'))}
        ${renderField('Created At', escapeHtml(detail.createdAt))}
        ${renderField('Updated At', escapeHtml(detail.updatedAt))}
      </div>
    </div>
    <div class="section">
      <div class="section-head"><h3>Structure and History</h3></div>
      <div class="meta">Versions</div>
      ${versionRows}
      <div class="meta">Data Template</div>
      ${detail.dataTemplate ? `<pre>${escapeHtml(formatJson(detail.dataTemplate))}</pre>` : '<div class="empty">No data template found.</div>'}
      <div class="meta">Dataset Rows</div>
      ${datasetRows}
    </div>
    <div class="section">
      <div class="section-head"><h3>Linked Data</h3></div>
      <div class="grid-2">
        ${renderField('Latest Run', detail.latestRun ? `<a href="/runs${buildQueryString({ ...scopeParams(scope), run_id: detail.latestRun.id })}">${escapeHtml(detail.latestRun.name ?? detail.latestRun.id)}</a>` : '—')}
        ${renderField('Default Bind Target', escapeHtml(latestVersion?.defaultDatasetRowId ?? '—'))}
      </div>
    </div>
    <div class="section">
      <div class="section-head"><h3>Actions</h3></div>
      ${renderActionPanel('Edit Test Case', `
        <form method="post" action="/actions/test-cases/update" style="display:grid; gap:10px;">
          ${hiddenInput('tenant_id', scope.tenantId)}
          ${hiddenInput('project_id', scope.projectId)}
          ${hiddenInput('test_case_id', detail.id)}
          ${hiddenInput('return_to', returnTo)}
          <input name="name" value="${escapeHtml(detail.name)}">
          <select name="status">${renderOptions(detail.status, ['draft', 'active', 'archived'])}</select>
          <button type="submit">Save Test Case</button>
        </form>
      `)}
      ${renderActionPanel('Create Version', `
        <form method="post" action="/actions/test-cases/create-version" style="display:grid; gap:10px;">
          ${hiddenInput('tenant_id', scope.tenantId)}
          ${hiddenInput('project_id', scope.projectId)}
          ${hiddenInput('test_case_id', detail.id)}
          ${hiddenInput('return_to', returnTo)}
          <input name="version_label" placeholder="Version label" value="console-update">
          <input name="change_summary" placeholder="Change summary" value="created from console">
          <textarea name="plan_json">${escapeHtml(formatJson(latestVersion?.plan ?? DEFAULT_PLAN))}</textarea>
          <textarea name="env_profile_json">${escapeHtml(formatJson(latestVersion?.envProfile ?? DEFAULT_ENV_PROFILE))}</textarea>
          <label><input type="checkbox" name="publish" value="true"> Publish immediately</label>
          <button type="submit">Create Version</button>
        </form>
      `)}
      ${renderActionPanel('Dataset Actions', `
        <form method="post" action="/actions/test-case-versions/create-dataset-row" style="display:grid; gap:10px;">
          ${hiddenInput('tenant_id', scope.tenantId)}
          ${hiddenInput('project_id', scope.projectId)}
          ${hiddenInput('version_id', latestVersion?.id ?? '')}
          ${hiddenInput('return_to', returnTo)}
          <input name="name" placeholder="Dataset row name" value="console-row">
          <textarea name="values_json">{}</textarea>
          <button type="submit"${latestVersion ? '' : ' disabled'}>Create Dataset Row</button>
        </form>
        <form method="post" action="/actions/test-case-versions/bind-default-dataset" style="display:grid; gap:10px;">
          ${hiddenInput('tenant_id', scope.tenantId)}
          ${hiddenInput('project_id', scope.projectId)}
          ${hiddenInput('version_id', latestVersion?.id ?? '')}
          ${hiddenInput('return_to', returnTo)}
          <select name="dataset_row_id">
            ${detail.datasetRows.map((row) => `<option value="${escapeHtml(row.id)}"${row.id === latestVersion?.defaultDatasetRowId ? ' selected' : ''}>${escapeHtml(row.name)}</option>`).join('')}
          </select>
          <button type="submit"${latestVersion && detail.datasetRows.length ? '' : ' disabled'}>Bind Default Dataset Row</button>
        </form>
      `)}
      ${renderActionPanel('Run Latest Published Version', `
        <form method="post" action="/actions/test-cases/run-latest-published" style="display:grid; gap:10px;">
          ${hiddenInput('tenant_id', scope.tenantId)}
          ${hiddenInput('project_id', scope.projectId)}
          ${hiddenInput('test_case_id', detail.id)}
          ${hiddenInput('return_to', returnTo)}
          <input name="name" value="${escapeHtml(`${detail.name} replay`)}">
          <input name="dataset_row_id" value="${escapeHtml(latestVersion?.defaultDatasetRowId ?? '')}" placeholder="Optional dataset row id">
          <button type="submit"${detail.latestPublishedVersionId ? '' : ' disabled'}>Run Latest Published Version</button>
        </form>
      `)}
      ${renderActionPanel('Archive Test Case', `
        <form method="post" action="/actions/test-cases/archive">
          ${hiddenInput('tenant_id', scope.tenantId)}
          ${hiddenInput('project_id', scope.projectId)}
          ${hiddenInput('test_case_id', detail.id)}
          ${hiddenInput('return_to', returnTo)}
          <button type="submit" class="secondary">Archive</button>
        </form>
      `)}
    </div>
  `;
};

const renderRecordingDetailCard = (
  scope: ProjectScope,
  pathname: string,
  params: URLSearchParams,
  detail: RecordingDetail | null,
): string => {
  if (!detail) {
    return '<div class="empty">Select a recording to view details.</div>';
  }
  const returnTo = `${pathname}?${params.toString()}&asset_id=${encodeURIComponent(detail.id)}`;
  return `
    <div class="section">
      <div class="section-head">
        <h2>${escapeHtml(detail.name)}</h2>
        <div class="inline-actions">${renderStatus(detail.status)}<span class="badge">${escapeHtml(detail.sourceType)}</span><span class="badge mono">${escapeHtml(detail.id)}</span></div>
      </div>
      <div class="grid-2">
        ${renderField('Started At', escapeHtml(detail.startedAt))}
        ${renderField('Finished At', escapeHtml(detail.finishedAt ?? '—'))}
      </div>
      <pre>${escapeHtml(formatJson(detail.envProfile))}</pre>
    </div>
    <div class="section">
      <div class="section-head"><h3>Recording Events</h3></div>
      ${detail.events.length ? `<table><thead><tr><th>#</th><th>Type</th><th>Page</th><th>Captured</th></tr></thead><tbody>${detail.events.map((event) => `<tr><td>${event.seqNo}</td><td>${escapeHtml(event.eventType)}</td><td class="mono">${escapeHtml(event.pageUrl ?? '—')}</td><td>${escapeHtml(event.capturedAt)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No recording events.</div>'}
    </div>
    <div class="section">
      <div class="section-head"><h3>Analysis Jobs</h3></div>
      ${detail.analysisJobs.length ? `<table><thead><tr><th>ID</th><th>Status</th><th>Started</th><th>Finished</th></tr></thead><tbody>${detail.analysisJobs.map((job) => `<tr><td class="mono">${escapeHtml(job.id)}</td><td>${renderStatus(job.status)}</td><td>${escapeHtml(job.startedAt)}</td><td>${escapeHtml(job.finishedAt ?? '—')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No analysis jobs yet.</div>'}
    </div>
    <div class="section">
      <div class="section-head"><h3>Derived Cases</h3></div>
      ${detail.derivedCases.length ? `<table><thead><tr><th>Case</th><th>Version</th><th>Status</th><th>Created</th></tr></thead><tbody>${detail.derivedCases.map((item) => `<tr><td><a href="/assets${buildQueryString({ ...scopeParams(scope), asset_type: 'test-cases', asset_id: item.testCaseId })}">${escapeHtml(item.caseName)}</a></td><td class="mono">${escapeHtml(item.versionId)}</td><td>${renderStatus(item.status)}</td><td>${escapeHtml(item.createdAt)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No derived cases yet.</div>'}
    </div>
    <div class="section">
      <div class="section-head"><h3>Actions</h3></div>
      ${renderActionPanel('Analyze DSL', `
        <form method="post" action="/actions/recordings/analyze">
          ${hiddenInput('tenant_id', scope.tenantId)}
          ${hiddenInput('project_id', scope.projectId)}
          ${hiddenInput('recording_id', detail.id)}
          ${hiddenInput('return_to', returnTo)}
          <button type="submit">Analyze DSL</button>
        </form>
      `)}
      ${renderActionPanel('Publish as Test Case', `
        <form method="post" action="/actions/recordings/publish" style="display:grid; gap:10px;">
          ${hiddenInput('tenant_id', scope.tenantId)}
          ${hiddenInput('project_id', scope.projectId)}
          ${hiddenInput('recording_id', detail.id)}
          ${hiddenInput('return_to', returnTo)}
          <input name="name" value="${escapeHtml(`${detail.name} case`)}">
          <input name="version_label" value="recording-v1">
          <input name="change_summary" value="published from console">
          <label><input type="checkbox" name="publish" value="true" checked> Publish immediately</label>
          <textarea name="default_dataset_json">{}</textarea>
          <button type="submit">Publish as Test Case</button>
        </form>
      `)}
    </div>
  `;
};

const renderNewAssetActions = (scope: ProjectScope | null, returnTo: string): string => {
  if (!scope) {
    return '';
  }
  return [
    renderActionPanel('New Test Case', `
      <form method="post" action="/actions/test-cases/create" style="display:grid; gap:10px;">
        ${hiddenInput('tenant_id', scope.tenantId)}
        ${hiddenInput('project_id', scope.projectId)}
        ${hiddenInput('return_to', returnTo)}
        <input name="name" value="console-test-case">
        <input name="version_label" value="v1">
        <input name="change_summary" value="created from console">
        <textarea name="plan_json">${escapeHtml(formatJson(DEFAULT_PLAN))}</textarea>
        <textarea name="env_profile_json">${escapeHtml(formatJson(DEFAULT_ENV_PROFILE))}</textarea>
        <label><input type="checkbox" name="publish" value="true"> Publish immediately</label>
        <textarea name="default_dataset_json">{}</textarea>
        <button type="submit">Create Test Case</button>
      </form>
    `),
    renderActionPanel('New Recording', `
      <form method="post" action="/actions/recordings/create" style="display:grid; gap:10px;">
        ${hiddenInput('tenant_id', scope.tenantId)}
        ${hiddenInput('project_id', scope.projectId)}
        ${hiddenInput('return_to', returnTo)}
        <input name="name" value="console-recording">
        <select name="source_type">${renderOptions('manual', ['manual', 'auto_explore', 'run_replay'])}</select>
        <textarea name="env_profile_json">${escapeHtml(formatJson(DEFAULT_ENV_PROFILE))}</textarea>
        <button type="submit">Create Recording</button>
      </form>
    `),
  ].join('');
};

const renderRunsPage = async (ctx: RouteContext, pathname: string, url: URL): Promise<string> => {
  const systemStatus = ctx.currentScope
    ? await ctx.store.getSystemStatus(ctx.currentScope.tenantId, ctx.currentScope.projectId)
    : null;
  const queryValue = url.searchParams.get('query') ?? '';
  const status = url.searchParams.get('status') ?? 'all';
  const selectionKind = url.searchParams.get('selection_kind') ?? 'all';
  const page = Number(url.searchParams.get('page') ?? '1');
  const currentParams = buildSearchParams({
    ...scopeParams(ctx.currentScope),
    query: queryValue,
    status,
    selection_kind: selectionKind,
    page,
  });
  const pageHeader = `
    <div class="page-header">
      <div>
        <h1>Runs</h1>
        <div class="subtitle">Runs, items, step events, artifacts, and AI diagnostics.</div>
      </div>
      <div class="header-actions">
        ${ctx.currentScope ? renderNewRunAction(ctx.currentScope, `${pathname}?${currentParams.toString()}`) : ''}
      </div>
    </div>
  `;
  if (!ctx.currentScope) {
    return renderLayout({
      currentNav: 'runs',
      pathname,
      scopes: ctx.scopes,
      currentScope: ctx.currentScope,
      systemStatus,
      notice: url.searchParams.get('notice'),
      error: url.searchParams.get('error'),
      pageHeader,
      pageBody: '<div class="empty">No project selected.</div>',
    });
  }
  const listResult = await ctx.store.listRuns(ctx.currentScope.tenantId, ctx.currentScope.projectId, {
    query: queryValue,
    status,
    selectionKind,
    page,
  });
  const selectedRunId = url.searchParams.get('run_id') ?? listResult.items[0]?.id ?? null;
  const runDetail = selectedRunId
    ? await ctx.store.getRunDetail(ctx.currentScope.tenantId, selectedRunId, url.searchParams.get('run_item_id') ?? undefined)
    : null;
  const filterForm = `
    <form class="filters" method="get" action="${escapeHtml(pathname)}">
      ${hiddenInput('tenant_id', ctx.currentScope.tenantId)}
      ${hiddenInput('project_id', ctx.currentScope.projectId)}
      <input type="search" name="query" value="${escapeHtml(queryValue)}" placeholder="Search by run name or ID">
      <select name="status">${renderOptions(status, ['all', 'queued', 'running', 'passed', 'failed', 'canceled'])}</select>
      <select name="selection_kind">${renderOptions(selectionKind, ['all', 'inline_web_plan', 'case_version'])}</select>
      <button type="submit">Apply</button>
    </form>
  `;
  const listMarkup = renderRunList(pathname, currentParams, listResult, selectedRunId);
  const detailMarkup = renderRunDetailCard(
    ctx.currentScope,
    ctx.config.controlPlanePublicBaseUrl,
    pathname,
    currentParams,
    runDetail,
  );
  return renderLayout({
    currentNav: 'runs',
    pathname,
    scopes: ctx.scopes,
    currentScope: ctx.currentScope,
    systemStatus,
    notice: url.searchParams.get('notice'),
    error: url.searchParams.get('error'),
    pageHeader,
    pageBody: `${filterForm}<div class="page-body"><div class="list">${listMarkup}</div><div class="detail">${detailMarkup}</div></div>`,
  });
};

const renderRunList = (pathname: string, params: URLSearchParams, listResult: PageResult<RunListItem>, selectedRunId: string | null): string => {
  const items = listResult.items.map((item) => {
    const next = new URLSearchParams(params);
    next.set('run_id', item.id);
    return `
      <a class="list-item${item.id === selectedRunId ? ' selected' : ''}" href="${escapeHtml(`${pathname}?${next.toString()}`)}">
        <strong>${escapeHtml(item.name ?? item.id)}</strong>
        <div class="inline-actions">${renderStatus(item.status)}${item.selectionKind ? `<span class="badge">${escapeHtml(item.selectionKind)}</span>` : ''}</div>
        <div class="meta mono">${escapeHtml(item.id)}</div>
        <div class="meta">updated ${escapeHtml(item.updatedAt)}</div>
      </a>
    `;
  }).join('');
  return `${items || '<div class="empty">No runs for current filter.</div>'}${renderPagination(listResult, pathname, params)}`;
};

const renderArtifactLink = (artifact: ArtifactSummary, publicBaseUrl: string): string =>
  `<a class="button secondary" href="${escapeHtml(`${publicBaseUrl}/api/v1/internal/artifacts/${artifact.id}/download`)}">Download</a>`;

const renderRunDetailCard = (
  scope: ProjectScope,
  controlPlanePublicBaseUrl: string,
  pathname: string,
  params: URLSearchParams,
  detail: RunDetail | null,
): string => {
  if (!detail) {
    return '<div class="empty">Select a run to view details.</div>';
  }
  const returnTo = `${pathname}?${params.toString()}&run_id=${encodeURIComponent(detail.id)}${detail.selectedRunItemId ? `&run_item_id=${encodeURIComponent(detail.selectedRunItemId)}` : ''}`;
  const runItemRows = detail.runItems.length
    ? detail.runItems.map((item) => {
        const next = new URLSearchParams(params);
        next.set('run_id', detail.id);
        next.set('run_item_id', item.id);
        return `
          <tr>
            <td><a href="${escapeHtml(`${pathname}?${next.toString()}`)}">${escapeHtml(item.id)}</a></td>
            <td>${renderStatus(item.status)}</td>
            <td>${escapeHtml(item.jobKind)}</td>
            <td class="mono">${escapeHtml(item.testCaseVersionId ?? '—')}</td>
            <td class="mono">${escapeHtml(item.datasetRowId ?? '—')}</td>
            <td class="mono">${escapeHtml(item.assignedAgentId ?? '—')}</td>
          </tr>
        `;
      }).join('')
    : '';

  return `
    <div class="section">
      <div class="section-head">
        <h2>${escapeHtml(detail.name ?? detail.id)}</h2>
        <div class="inline-actions">${renderStatus(detail.status)}${detail.selectionKind ? `<span class="badge">${escapeHtml(detail.selectionKind)}</span>` : ''}<span class="badge mono">${escapeHtml(detail.id)}</span></div>
      </div>
      <div class="grid-2">
        ${renderField('Mode', escapeHtml(detail.mode ?? '—'))}
        ${renderField('Selection Kind', escapeHtml(detail.selectionKind ?? '—'))}
        ${renderField('Started At', escapeHtml(detail.startedAt ?? '—'))}
        ${renderField('Finished At', escapeHtml(detail.finishedAt ?? '—'))}
      </div>
      <div class="meta mono">Last Event ${escapeHtml(detail.lastEventId)}</div>
    </div>
    <div class="section">
      <div class="section-head"><h3>Run Items</h3></div>
      ${runItemRows ? `<table><thead><tr><th>Run Item</th><th>Status</th><th>Job Kind</th><th>Case Version</th><th>Dataset</th><th>Agent</th></tr></thead><tbody>${runItemRows}</tbody></table>` : '<div class="empty">No run items.</div>'}
    </div>
    <div class="section">
      <div class="section-head"><h3>Step Events</h3></div>
      ${detail.stepEvents.length ? `<table><thead><tr><th>Step</th><th>Status</th><th>Started</th><th>Finished</th><th>Duration</th><th>Error</th></tr></thead><tbody>${detail.stepEvents.map((event) => `<tr><td class="mono">${escapeHtml(event.sourceStepId)}</td><td>${renderStatus(event.status)}</td><td>${escapeHtml(event.startedAt)}</td><td>${escapeHtml(event.finishedAt)}</td><td>${event.durationMs}ms</td><td>${escapeHtml(event.errorCode ?? '—')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No step events for selected run item.</div>'}
    </div>
    <div class="section">
      <div class="section-head"><h3>Evidence</h3></div>
      ${detail.artifacts.length ? `<table><thead><tr><th>Artifact</th><th>Content Type</th><th>Size</th><th>Created</th><th></th></tr></thead><tbody>${detail.artifacts.map((artifact) => `<tr><td>${escapeHtml(artifact.artifactType)}</td><td>${escapeHtml(artifact.contentType ?? '—')}</td><td>${escapeHtml(artifact.sizeBytes === null ? '—' : formatBytes(artifact.sizeBytes))}</td><td>${escapeHtml(artifact.createdAt)}</td><td>${renderArtifactLink(artifact, controlPlanePublicBaseUrl)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No artifacts for selected run item.</div>'}
      <div class="meta">Artifact downloads are served through control-plane.</div>
    </div>
    <div class="section">
      <div class="section-head"><h3>AI Diagnostics</h3></div>
      <div class="grid-2">
        <div>
          <div class="meta" style="margin-bottom:8px;">Self-heal Attempts</div>
          ${detail.selfHealAttempts.length ? detail.selfHealAttempts.map((attempt) => `<div class="list-item"><strong>${escapeHtml(attempt.id)}</strong><div class="inline-actions">${renderStatus(attempt.status)}</div><div class="meta">${escapeHtml(attempt.explanation ?? 'No explanation')}</div><div class="meta mono">replay ${escapeHtml(attempt.replayRunId ?? '—')} · derived ${escapeHtml(attempt.derivedTestCaseVersionId ?? '—')}</div></div>`).join('') : '<div class="empty">No self-heal attempts yet.</div>'}
        </div>
        <div>
          <div class="meta" style="margin-bottom:8px;">Run Evaluations</div>
          ${detail.runEvaluations.length ? detail.runEvaluations.map((evaluation) => `<div class="list-item"><strong>${escapeHtml(evaluation.id)}</strong><div class="inline-actions">${renderStatus(evaluation.verdict)}</div><div class="meta">${escapeHtml(evaluation.explanation)}</div><div class="meta mono">${escapeHtml(evaluation.linkedArtifactIds.join(', ') || 'No linked artifacts')}</div></div>`).join('') : '<div class="empty">No run evaluations yet.</div>'}
        </div>
      </div>
    </div>
    <div class="section">
      <div class="section-head"><h3>Actions</h3></div>
      ${renderActionPanel('Cancel Run', `
        <form method="post" action="/actions/runs/cancel">
          ${hiddenInput('tenant_id', scope.tenantId)}
          ${hiddenInput('project_id', scope.projectId)}
          ${hiddenInput('run_id', detail.id)}
          ${hiddenInput('return_to', returnTo)}
          <button type="submit" class="secondary">Cancel</button>
        </form>
      `)}
      ${renderActionPanel('Run Item Actions', `
        <form method="post" action="/actions/run-items/evaluate" style="display:grid; gap:10px;">
          ${hiddenInput('tenant_id', scope.tenantId)}
          ${hiddenInput('project_id', scope.projectId)}
          ${hiddenInput('run_item_id', detail.selectedRunItemId ?? '')}
          ${hiddenInput('return_to', returnTo)}
          <button type="submit"${detail.selectedRunItemId ? '' : ' disabled'}>Evaluate</button>
        </form>
        <form method="post" action="/actions/run-items/self-heal" style="display:grid; gap:10px;">
          ${hiddenInput('tenant_id', scope.tenantId)}
          ${hiddenInput('project_id', scope.projectId)}
          ${hiddenInput('run_item_id', detail.selectedRunItemId ?? '')}
          ${hiddenInput('return_to', returnTo)}
          <label><input type="checkbox" name="derive_draft_version" value="true" checked> Derive draft version on success</label>
          <button type="submit"${detail.selectedRunItemId ? '' : ' disabled'}>Self-heal</button>
        </form>
        <form method="post" action="/actions/run-items/extract-test-case" style="display:grid; gap:10px;">
          ${hiddenInput('tenant_id', scope.tenantId)}
          ${hiddenInput('project_id', scope.projectId)}
          ${hiddenInput('run_item_id', detail.selectedRunItemId ?? '')}
          ${hiddenInput('return_to', returnTo)}
          <input name="name" value="console-extracted-case">
          <input name="version_label" value="derived-v1">
          <input name="change_summary" value="extracted from console">
          <label><input type="checkbox" name="publish" value="true"> Publish immediately</label>
          <button type="submit"${detail.selectedRunItemId ? '' : ' disabled'}>Extract Test Case</button>
        </form>
      `)}
    </div>
  `;
};

const renderNewRunAction = (scope: ProjectScope, returnTo: string): string => renderActionPanel('New Run', `
  <form method="post" action="/actions/runs/create" style="display:grid; gap:10px;">
    ${hiddenInput('tenant_id', scope.tenantId)}
    ${hiddenInput('project_id', scope.projectId)}
    ${hiddenInput('return_to', returnTo)}
    <input name="name" value="console-run">
    <select name="selection_kind">${renderOptions('inline_web_plan', ['inline_web_plan', 'case_version'])}</select>
    <input name="case_version_id" placeholder="Case version id for case_version runs">
    <input name="dataset_row_id" placeholder="Optional dataset row id">
    <textarea name="plan_json">${escapeHtml(formatJson(DEFAULT_PLAN))}</textarea>
    <textarea name="env_profile_json">${escapeHtml(formatJson(DEFAULT_ENV_PROFILE))}</textarea>
    <button type="submit">Create Run</button>
  </form>
`);

const renderAiWorkspacePage = async (ctx: RouteContext, pathname: string, url: URL): Promise<string> => {
  const systemStatus = ctx.currentScope
    ? await ctx.store.getSystemStatus(ctx.currentScope.tenantId, ctx.currentScope.projectId)
    : null;
  const view = url.searchParams.get('workspace_view') === 'explorations' ? 'explorations' : 'threads';
  const queryValue = url.searchParams.get('query') ?? '';
  const status = url.searchParams.get('status') ?? 'all';
  const page = Number(url.searchParams.get('page') ?? '1');
  const currentParams = buildSearchParams({
    ...scopeParams(ctx.currentScope),
    workspace_view: view,
    query: queryValue,
    ...(view === 'explorations' ? { status } : {}),
    page,
  });
  const pageHeader = `
    <div class="page-header">
      <div>
        <h1>AI Workspace</h1>
        <div class="subtitle">Threads, explorations, memory facts, generated artifacts, and publish actions.</div>
      </div>
      <div class="header-actions">
        ${ctx.currentScope ? renderNewAiActions(ctx.currentScope, `${pathname}?${currentParams.toString()}`) : ''}
      </div>
    </div>
  `;
  if (!ctx.currentScope) {
    return renderLayout({
      currentNav: 'ai-workspace',
      pathname,
      scopes: ctx.scopes,
      currentScope: ctx.currentScope,
      systemStatus,
      notice: url.searchParams.get('notice'),
      error: url.searchParams.get('error'),
      pageHeader,
      pageBody: '<div class="empty">No project selected.</div>',
    });
  }
  const listResult = view === 'explorations'
    ? await ctx.store.listExplorations(ctx.currentScope.tenantId, ctx.currentScope.projectId, { query: queryValue, status, page })
    : await ctx.store.listThreads(ctx.currentScope.tenantId, ctx.currentScope.projectId, { query: queryValue, page });
  const selectedId = view === 'explorations'
    ? url.searchParams.get('exploration_id') ?? listResult.items[0]?.id ?? null
    : url.searchParams.get('thread_id') ?? listResult.items[0]?.id ?? null;
  const detail = view === 'explorations'
    ? selectedId ? await ctx.store.getExplorationDetail(ctx.currentScope.tenantId, selectedId) : null
    : selectedId ? await ctx.store.getThreadDetail(ctx.currentScope.tenantId, selectedId) : null;
  const filterForm = `
    <form class="filters" method="get" action="${escapeHtml(pathname)}">
      ${hiddenInput('tenant_id', ctx.currentScope.tenantId)}
      ${hiddenInput('project_id', ctx.currentScope.projectId)}
      <select name="workspace_view">
        <option value="threads"${view === 'threads' ? ' selected' : ''}>Threads</option>
        <option value="explorations"${view === 'explorations' ? ' selected' : ''}>Explorations</option>
      </select>
      <input type="search" name="query" value="${escapeHtml(queryValue)}" placeholder="Search title, name, or ID">
      ${view === 'explorations' ? `<select name="status">${renderOptions(status, ['all', 'draft', 'running', 'succeeded', 'failed', 'stopped'])}</select>` : ''}
      <button type="submit">Apply</button>
    </form>
  `;
  const listMarkup = view === 'explorations'
    ? renderExplorationList(pathname, currentParams, listResult as PageResult<ExplorationListItem>, selectedId)
    : renderThreadList(pathname, currentParams, listResult as PageResult<ThreadListItem>, selectedId);
  const detailMarkup = view === 'explorations'
    ? renderExplorationDetailCard(ctx.currentScope, pathname, currentParams, detail as ExplorationDetail | null)
    : renderThreadDetailCard(ctx.currentScope, pathname, currentParams, detail as ThreadDetail | null);
  return renderLayout({
    currentNav: 'ai-workspace',
    pathname,
    scopes: ctx.scopes,
    currentScope: ctx.currentScope,
    systemStatus,
    notice: url.searchParams.get('notice'),
    error: url.searchParams.get('error'),
    pageHeader,
    pageBody: `${filterForm}<div class="page-body"><div class="list">${listMarkup}</div><div class="detail">${detailMarkup}</div></div>`,
  });
};

const renderNewAiActions = (scope: ProjectScope, returnTo: string): string => [
  renderActionPanel('New Thread', `
    <form method="post" action="/actions/threads/create" style="display:grid; gap:10px;">
      ${hiddenInput('tenant_id', scope.tenantId)}
      ${hiddenInput('project_id', scope.projectId)}
      ${hiddenInput('return_to', returnTo)}
      <input name="title" value="console thread">
      <button type="submit">Create Thread</button>
    </form>
  `),
  renderActionPanel('New Exploration', `
    <form method="post" action="/actions/explorations/create" style="display:grid; gap:10px;">
      ${hiddenInput('tenant_id', scope.tenantId)}
      ${hiddenInput('project_id', scope.projectId)}
      ${hiddenInput('return_to', returnTo)}
      <input name="name" value="console exploration">
      <input name="thread_id" placeholder="Optional thread id">
      <input name="start_url" value="https://example.com">
      <textarea name="instruction">Explore the target flow and capture a recording.</textarea>
      <button type="submit">Create Exploration</button>
    </form>
  `),
].join('');

const renderThreadList = (pathname: string, params: URLSearchParams, listResult: PageResult<ThreadListItem>, selectedId: string | null): string => {
  const items = listResult.items.map((item) => {
    const next = new URLSearchParams(params);
    next.set('thread_id', item.id);
    return `
      <a class="list-item${item.id === selectedId ? ' selected' : ''}" href="${escapeHtml(`${pathname}?${next.toString()}`)}">
        <strong>${escapeHtml(item.title ?? item.id)}</strong>
        <div class="meta">${item.messageCount} messages · ${item.factCount} facts</div>
        <div class="meta mono">${escapeHtml(item.id)}</div>
        <div class="meta">updated ${escapeHtml(item.updatedAt)}</div>
      </a>
    `;
  }).join('');
  return `${items || '<div class="empty">No threads for current filter.</div>'}${renderPagination(listResult, pathname, params)}`;
};

const renderExplorationList = (pathname: string, params: URLSearchParams, listResult: PageResult<ExplorationListItem>, selectedId: string | null): string => {
  const items = listResult.items.map((item) => {
    const next = new URLSearchParams(params);
    next.set('exploration_id', item.id);
    return `
      <a class="list-item${item.id === selectedId ? ' selected' : ''}" href="${escapeHtml(`${pathname}?${next.toString()}`)}">
        <strong>${escapeHtml(item.name ?? item.id)}</strong>
        <div class="inline-actions">${renderStatus(item.status)}${item.recordingId ? `<span class="badge mono">${escapeHtml(item.recordingId)}</span>` : ''}</div>
        <div class="meta mono">${escapeHtml(item.startUrl)}</div>
        <div class="meta">updated ${escapeHtml(item.updatedAt)}</div>
      </a>
    `;
  }).join('');
  return `${items || '<div class="empty">No explorations for current filter.</div>'}${renderPagination(listResult, pathname, params)}`;
};

const renderThreadDetailCard = (
  scope: ProjectScope,
  pathname: string,
  params: URLSearchParams,
  detail: ThreadDetail | null,
): string => {
  if (!detail) {
    return '<div class="empty">Select a thread to view details.</div>';
  }
  const returnTo = `${pathname}?${params.toString()}&thread_id=${encodeURIComponent(detail.id)}`;
  return `
    <div class="section">
      <div class="section-head">
        <h2>${escapeHtml(detail.title ?? detail.id)}</h2>
        <div class="inline-actions"><span class="badge mono">${escapeHtml(detail.id)}</span></div>
      </div>
      <div class="grid-2">
        ${renderField('Created At', escapeHtml(detail.createdAt))}
        ${renderField('Updated At', escapeHtml(detail.updatedAt))}
      </div>
    </div>
    <div class="section">
      <div class="section-head"><h3>Messages</h3></div>
      ${detail.messages.length ? detail.messages.map((message) => `<div class="list-item"><strong>${escapeHtml(message.role)}</strong><div>${escapeHtml(message.content)}</div><div class="meta">${escapeHtml(message.createdAt)}</div></div>`).join('') : '<div class="empty">No messages yet.</div>'}
    </div>
    <div class="section">
      <div class="section-head"><h3>Memory Facts</h3></div>
      ${detail.facts.length ? detail.facts.map((fact) => `<div class="list-item"><strong>${escapeHtml(fact.content)}</strong><div class="meta">confidence ${fact.confidence.toFixed(2)} · ${escapeHtml(fact.createdAt)}</div></div>`).join('') : '<div class="empty">No memory facts yet.</div>'}
    </div>
    <div class="section">
      <div class="section-head"><h3>Linked Explorations</h3></div>
      ${detail.explorations.length ? detail.explorations.map((exploration) => `<a class="list-item" href="/ai-workspace${buildQueryString({ ...scopeParams(scope), workspace_view: 'explorations', exploration_id: exploration.id })}"><strong>${escapeHtml(exploration.name ?? exploration.id)}</strong><div class="inline-actions">${renderStatus(exploration.status)}</div><div class="meta">${escapeHtml(exploration.updatedAt)}</div></a>`).join('') : '<div class="empty">No linked explorations yet.</div>'}
    </div>
    <div class="section">
      <div class="section-head"><h3>Actions</h3></div>
      ${renderActionPanel('Send Message', `
        <form method="post" action="/actions/threads/send" style="display:grid; gap:10px;">
          ${hiddenInput('tenant_id', scope.tenantId)}
          ${hiddenInput('project_id', scope.projectId)}
          ${hiddenInput('thread_id', detail.id)}
          ${hiddenInput('return_to', returnTo)}
          <textarea name="content">请总结一下当前线程已持有的事实。</textarea>
          <button type="submit">Send</button>
        </form>
      `)}
      ${renderActionPanel('Edit Title', `
        <form method="post" action="/actions/threads/update" style="display:grid; gap:10px;">
          ${hiddenInput('tenant_id', scope.tenantId)}
          ${hiddenInput('project_id', scope.projectId)}
          ${hiddenInput('thread_id', detail.id)}
          ${hiddenInput('return_to', returnTo)}
          <input name="title" value="${escapeHtml(detail.title ?? '')}">
          <button type="submit">Save Title</button>
        </form>
      `)}
    </div>
  `;
};

const renderExplorationDetailCard = (
  scope: ProjectScope,
  pathname: string,
  params: URLSearchParams,
  detail: ExplorationDetail | null,
): string => {
  if (!detail) {
    return '<div class="empty">Select an exploration to view details.</div>';
  }
  const returnTo = `${pathname}?${params.toString()}&exploration_id=${encodeURIComponent(detail.id)}`;
  return `
    <div class="section">
      <div class="section-head">
        <h2>${escapeHtml(detail.name ?? detail.id)}</h2>
        <div class="inline-actions">${renderStatus(detail.status)}<span class="badge mono">${escapeHtml(detail.id)}</span></div>
      </div>
      <div class="grid-2">
        ${renderField('Start URL', `<span class="mono">${escapeHtml(detail.startUrl)}</span>`)}
        ${renderField('Execution Mode', escapeHtml(detail.executionMode))}
        ${renderField('Thread', escapeHtml(detail.threadId ?? '—'))}
        ${renderField('Recording', escapeHtml(detail.recordingId ?? '—'))}
      </div>
      <pre>${escapeHtml(formatJson({ instruction: detail.instruction, summary: detail.summary, lastSnapshotMarkdown: detail.lastSnapshotMarkdown, sampleDataset: detail.sampleDataset }))}</pre>
    </div>
    <div class="section">
      <div class="section-head"><h3>Artifacts</h3></div>
      ${detail.artifacts.length ? `<table><thead><tr><th>Kind</th><th>Path</th><th>Size</th></tr></thead><tbody>${detail.artifacts.map((artifact) => `<tr><td>${escapeHtml(artifact.kind)}</td><td class="mono">${escapeHtml(artifact.path)}</td><td>${escapeHtml(artifact.sizeBytes === null ? '—' : formatBytes(artifact.sizeBytes))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No exploration artifacts yet.</div>'}
    </div>
    <div class="section">
      <div class="section-head"><h3>Linked Data</h3></div>
      <div class="grid-2">
        ${renderField('Created Test Case', detail.createdTestCaseId ? `<a href="/assets${buildQueryString({ ...scopeParams(scope), asset_type: 'test-cases', asset_id: detail.createdTestCaseId })}">${escapeHtml(detail.createdTestCaseId)}</a>` : '—')}
        ${renderField('Created Version', escapeHtml(detail.createdTestCaseVersionId ?? '—'))}
      </div>
    </div>
    <div class="section">
      <div class="section-head"><h3>Actions</h3></div>
      ${renderActionPanel('Exploration Actions', `
        <form method="post" action="/actions/explorations/start">
          ${hiddenInput('tenant_id', scope.tenantId)}
          ${hiddenInput('project_id', scope.projectId)}
          ${hiddenInput('exploration_id', detail.id)}
          ${hiddenInput('return_to', returnTo)}
          <button type="submit">Start</button>
        </form>
        <form method="post" action="/actions/explorations/stop">
          ${hiddenInput('tenant_id', scope.tenantId)}
          ${hiddenInput('project_id', scope.projectId)}
          ${hiddenInput('exploration_id', detail.id)}
          ${hiddenInput('return_to', returnTo)}
          <button type="submit" class="secondary">Stop</button>
        </form>
        <form method="post" action="/actions/explorations/publish" style="display:grid; gap:10px;">
          ${hiddenInput('tenant_id', scope.tenantId)}
          ${hiddenInput('project_id', scope.projectId)}
          ${hiddenInput('exploration_id', detail.id)}
          ${hiddenInput('return_to', returnTo)}
          <input name="name" value="${escapeHtml(detail.name ?? 'exploration-case')}">
          <input name="version_label" value="exploration-v1">
          <input name="change_summary" value="published from console exploration">
          <label><input type="checkbox" name="publish" value="true" checked> Publish immediately</label>
          <button type="submit">Publish as Test Case</button>
        </form>
      `)}
      ${renderActionPanel('Edit Name', `
        <form method="post" action="/actions/explorations/update" style="display:grid; gap:10px;">
          ${hiddenInput('tenant_id', scope.tenantId)}
          ${hiddenInput('project_id', scope.projectId)}
          ${hiddenInput('exploration_id', detail.id)}
          ${hiddenInput('return_to', returnTo)}
          <input name="name" value="${escapeHtml(detail.name ?? '')}">
          <button type="submit">Save Name</button>
        </form>
      `)}
    </div>
  `;
};

const renderOptions = (current: string, options: string[]): string => options.map((value) => `
  <option value="${escapeHtml(value)}"${value === current ? ' selected' : ''}>${escapeHtml(value)}</option>
`).join('');

const formValue = (form: URLSearchParams, key: string): string => form.get(key)?.trim() ?? '';

const parseJsonField = (form: URLSearchParams, key: string, fallback: unknown): unknown => {
  const value = form.get(key);
  if (!value?.trim()) {
    return fallback;
  }
  return JSON.parse(value);
};

const handleAction = async (
  pathname: string,
  form: URLSearchParams,
  response: ServerResponse,
  client: ConsoleApiClient,
  store: ConsoleStore,
): Promise<boolean> => {
  const tenantId = formValue(form, 'tenant_id');
  const projectId = formValue(form, 'project_id');
  const returnTo = safeRedirectTarget(form.get('return_to'), '/overview');

  try {
    switch (pathname) {
      case '/actions/test-cases/create': {
        const payload = await client.controlPlane(tenantId, projectId, '/api/v1/test-cases', {
          method: 'POST',
          body: {
            tenant_id: tenantId,
            project_id: projectId,
            name: formValue(form, 'name'),
            version_label: formValue(form, 'version_label') || undefined,
            change_summary: formValue(form, 'change_summary') || undefined,
            publish: form.get('publish') === 'true',
            plan: parseJsonField(form, 'plan_json', DEFAULT_PLAN),
            env_profile: parseJsonField(form, 'env_profile_json', DEFAULT_ENV_PROFILE),
            default_dataset: {
              name: 'default',
              values: parseJsonField(form, 'default_dataset_json', {}),
            },
          },
        }) as { test_case: { id: string } };
        redirect(response, withFlash(`/assets${buildQueryString({ tenant_id: tenantId, project_id: projectId, asset_type: 'test-cases', asset_id: payload.test_case.id })}`, 'notice', 'Test case created'));
        return true;
      }
      case '/actions/test-cases/update': {
        await client.controlPlane(tenantId, projectId, `/api/v1/test-cases/${encodeURIComponent(formValue(form, 'test_case_id'))}`, {
          method: 'PATCH',
          body: {
            name: formValue(form, 'name'),
            status: formValue(form, 'status'),
          },
        });
        redirect(response, withFlash(returnTo, 'notice', 'Test case updated'));
        return true;
      }
      case '/actions/test-cases/archive': {
        await client.controlPlane(tenantId, projectId, `/api/v1/test-cases/${encodeURIComponent(formValue(form, 'test_case_id'))}`, {
          method: 'DELETE',
        });
        redirect(response, withFlash(returnTo, 'notice', 'Test case archived'));
        return true;
      }
      case '/actions/test-cases/create-version': {
        const testCaseId = formValue(form, 'test_case_id');
        await client.controlPlane(tenantId, projectId, `/api/v1/test-cases/${encodeURIComponent(testCaseId)}/versions`, {
          method: 'POST',
          body: {
            version_label: formValue(form, 'version_label') || undefined,
            change_summary: formValue(form, 'change_summary') || undefined,
            publish: form.get('publish') === 'true',
            plan: parseJsonField(form, 'plan_json', DEFAULT_PLAN),
            env_profile: parseJsonField(form, 'env_profile_json', DEFAULT_ENV_PROFILE),
          },
        });
        redirect(response, withFlash(returnTo, 'notice', 'Version created'));
        return true;
      }
      case '/actions/test-case-versions/publish': {
        await client.controlPlane(tenantId, projectId, `/api/v1/test-case-versions/${encodeURIComponent(formValue(form, 'version_id'))}:publish`, {
          method: 'POST',
        });
        redirect(response, withFlash(returnTo, 'notice', 'Version published'));
        return true;
      }
      case '/actions/test-case-versions/create-dataset-row': {
        await client.controlPlane(tenantId, projectId, `/api/v1/test-case-versions/${encodeURIComponent(formValue(form, 'version_id'))}/dataset-rows`, {
          method: 'POST',
          body: {
            name: formValue(form, 'name'),
            values: parseJsonField(form, 'values_json', {}),
          },
        });
        redirect(response, withFlash(returnTo, 'notice', 'Dataset row created'));
        return true;
      }
      case '/actions/test-case-versions/bind-default-dataset': {
        await client.controlPlane(tenantId, projectId, `/api/v1/test-case-versions/${encodeURIComponent(formValue(form, 'version_id'))}:bind-default-dataset`, {
          method: 'POST',
          body: {
            dataset_row_id: formValue(form, 'dataset_row_id'),
          },
        });
        redirect(response, withFlash(returnTo, 'notice', 'Default dataset row updated'));
        return true;
      }
      case '/actions/dataset-rows/update': {
        await client.controlPlane(tenantId, projectId, `/api/v1/dataset-rows/${encodeURIComponent(formValue(form, 'dataset_row_id'))}`, {
          method: 'PATCH',
          body: {
            name: formValue(form, 'name'),
            values: parseJsonField(form, 'values_json', {}),
          },
        });
        redirect(response, withFlash(returnTo, 'notice', 'Dataset row updated'));
        return true;
      }
      case '/actions/recordings/create': {
        const payload = await client.controlPlane(tenantId, projectId, '/api/v1/recordings', {
          method: 'POST',
          body: {
            tenant_id: tenantId,
            project_id: projectId,
            name: formValue(form, 'name'),
            source_type: formValue(form, 'source_type') || 'manual',
            env_profile: parseJsonField(form, 'env_profile_json', DEFAULT_ENV_PROFILE),
          },
        }) as { id: string };
        redirect(response, withFlash(`/assets${buildQueryString({ tenant_id: tenantId, project_id: projectId, asset_type: 'recordings', asset_id: payload.id })}`, 'notice', 'Recording created'));
        return true;
      }
      case '/actions/recordings/analyze': {
        await client.controlPlane(tenantId, projectId, `/api/v1/recordings/${encodeURIComponent(formValue(form, 'recording_id'))}:analyze-dsl`, {
          method: 'POST',
        });
        redirect(response, withFlash(returnTo, 'notice', 'Recording analysis started'));
        return true;
      }
      case '/actions/recordings/publish': {
        await client.controlPlane(tenantId, projectId, `/api/v1/recordings/${encodeURIComponent(formValue(form, 'recording_id'))}:publish-test-case`, {
          method: 'POST',
          body: {
            name: formValue(form, 'name'),
            version_label: formValue(form, 'version_label') || undefined,
            change_summary: formValue(form, 'change_summary') || undefined,
            publish: form.get('publish') === 'true',
            default_dataset: {
              name: 'default',
              values: parseJsonField(form, 'default_dataset_json', {}),
            },
          },
        });
        redirect(response, withFlash(returnTo, 'notice', 'Recording published as test case'));
        return true;
      }
      case '/actions/runs/create': {
        const selectionKind = formValue(form, 'selection_kind') || 'inline_web_plan';
        await client.controlPlane(tenantId, projectId, '/api/v1/runs', {
          method: 'POST',
          body: {
            tenant_id: tenantId,
            project_id: projectId,
            name: formValue(form, 'name'),
            mode: 'standard',
            selection: selectionKind === 'case_version'
              ? {
                  kind: 'case_version',
                  test_case_version_id: formValue(form, 'case_version_id'),
                  dataset_row_id: formValue(form, 'dataset_row_id') || undefined,
                }
              : {
                  kind: 'inline_web_plan',
                  plan: parseJsonField(form, 'plan_json', DEFAULT_PLAN),
                  env_profile: parseJsonField(form, 'env_profile_json', DEFAULT_ENV_PROFILE),
                },
          },
        });
        redirect(response, withFlash(returnTo, 'notice', 'Run created'));
        return true;
      }
      case '/actions/test-cases/run-latest-published': {
        const detail = await store.getTestCaseDetail(tenantId, formValue(form, 'test_case_id'));
        if (!detail?.latestPublishedVersionId) {
          throw new Error('No published version available');
        }
        await client.controlPlane(tenantId, projectId, '/api/v1/runs', {
          method: 'POST',
          body: {
            tenant_id: tenantId,
            project_id: projectId,
            name: formValue(form, 'name') || `${detail.name} replay`,
            mode: 'standard',
            selection: {
              kind: 'case_version',
              test_case_version_id: detail.latestPublishedVersionId,
              dataset_row_id: formValue(form, 'dataset_row_id') || undefined,
            },
          },
        });
        redirect(response, withFlash(returnTo, 'notice', 'Run created from latest published version'));
        return true;
      }
      case '/actions/runs/cancel': {
        await client.controlPlane(tenantId, projectId, `/api/v1/runs/${encodeURIComponent(formValue(form, 'run_id'))}:cancel`, {
          method: 'POST',
        });
        redirect(response, withFlash(returnTo, 'notice', 'Run cancel requested'));
        return true;
      }
      case '/actions/run-items/evaluate': {
        await client.ai(`/api/v1/run-items/${encodeURIComponent(formValue(form, 'run_item_id'))}:evaluate`, {
          method: 'POST',
          body: {
            tenantId,
            subjectId: client.defaultSubjectId,
          },
        });
        redirect(response, withFlash(returnTo, 'notice', 'Run item evaluation started'));
        return true;
      }
      case '/actions/run-items/self-heal': {
        await client.ai(`/api/v1/run-items/${encodeURIComponent(formValue(form, 'run_item_id'))}:self-heal`, {
          method: 'POST',
          body: {
            tenantId,
            subjectId: client.defaultSubjectId,
            deriveDraftVersionOnSuccess: form.get('derive_draft_version') === 'true',
          },
        });
        redirect(response, withFlash(returnTo, 'notice', 'Self-heal started'));
        return true;
      }
      case '/actions/run-items/extract-test-case': {
        await client.controlPlane(tenantId, projectId, `/api/v1/run-items/${encodeURIComponent(formValue(form, 'run_item_id'))}:extract-test-case`, {
          method: 'POST',
          body: {
            name: formValue(form, 'name'),
            version_label: formValue(form, 'version_label'),
            change_summary: formValue(form, 'change_summary'),
            publish: form.get('publish') === 'true',
          },
        });
        redirect(response, withFlash(returnTo, 'notice', 'Test case extraction started'));
        return true;
      }
      case '/actions/threads/create': {
        const payload = await client.ai('/api/v1/assistant/threads', {
          method: 'POST',
          body: {
            title: formValue(form, 'title'),
            tenantId,
            projectId,
            userId: client.defaultSubjectId,
          },
        }) as { thread: { id: string } };
        redirect(response, withFlash(`/ai-workspace${buildQueryString({ tenant_id: tenantId, project_id: projectId, workspace_view: 'threads', thread_id: payload.thread.id })}`, 'notice', 'Thread created'));
        return true;
      }
      case '/actions/threads/send': {
        const payload = await client.ai(`/api/v1/assistant/threads/${encodeURIComponent(formValue(form, 'thread_id'))}/messages`, {
          method: 'POST',
          body: { content: formValue(form, 'content') },
        }) as { action?: { summary?: string } };
        redirect(response, withFlash(returnTo, 'notice', payload.action?.summary ?? 'Message sent'));
        return true;
      }
      case '/actions/threads/update': {
        await store.updateThreadTitle(tenantId, formValue(form, 'thread_id'), formValue(form, 'title') || null);
        redirect(response, withFlash(returnTo, 'notice', 'Thread title updated'));
        return true;
      }
      case '/actions/explorations/create': {
        const payload = await client.ai('/api/v1/explorations', {
          method: 'POST',
          body: {
            tenantId,
            projectId,
            userId: client.defaultSubjectId,
            name: formValue(form, 'name') || undefined,
            threadId: formValue(form, 'thread_id') || undefined,
            instruction: formValue(form, 'instruction'),
            startUrl: formValue(form, 'start_url'),
          },
        }) as { exploration: { id: string } };
        redirect(response, withFlash(`/ai-workspace${buildQueryString({ tenant_id: tenantId, project_id: projectId, workspace_view: 'explorations', exploration_id: payload.exploration.id })}`, 'notice', 'Exploration created'));
        return true;
      }
      case '/actions/explorations/start': {
        await client.ai(`/api/v1/explorations/${encodeURIComponent(formValue(form, 'exploration_id'))}:start`, {
          method: 'POST',
          body: { subjectId: client.defaultSubjectId },
        });
        redirect(response, withFlash(returnTo, 'notice', 'Exploration started'));
        return true;
      }
      case '/actions/explorations/stop': {
        await client.ai(`/api/v1/explorations/${encodeURIComponent(formValue(form, 'exploration_id'))}:stop`, {
          method: 'POST',
        });
        redirect(response, withFlash(returnTo, 'notice', 'Exploration stopped'));
        return true;
      }
      case '/actions/explorations/publish': {
        await client.ai(`/api/v1/explorations/${encodeURIComponent(formValue(form, 'exploration_id'))}:publish-test-case`, {
          method: 'POST',
          body: {
            subjectId: client.defaultSubjectId,
            name: formValue(form, 'name') || undefined,
            versionLabel: formValue(form, 'version_label') || undefined,
            changeSummary: formValue(form, 'change_summary') || undefined,
            publish: form.get('publish') === 'true',
          },
        });
        redirect(response, withFlash(returnTo, 'notice', 'Exploration published as test case'));
        return true;
      }
      case '/actions/explorations/update': {
        await store.updateExplorationName(tenantId, formValue(form, 'exploration_id'), formValue(form, 'name') || null);
        redirect(response, withFlash(returnTo, 'notice', 'Exploration name updated'));
        return true;
      }
      default:
        return false;
    }
  } catch (error) {
    redirect(response, withFlash(returnTo, 'error', (error as Error).message));
    return true;
  }
};

export const startConsoleServer = async (config: ConsoleConfig): Promise<ConsoleServer> => {
  const store = new ConsoleStore(config.databaseUrl);
  const client = new ConsoleApiClient(config, store);
  const server = createServer(async (request, response) => {
    const method = request.method ?? 'GET';
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    const pathname = url.pathname;

    try {
      if (method === 'GET' && pathname === '/healthz') {
        sendJson(response, 200, { status: 'ok', service: 'console' });
        return;
      }

      if (method === 'GET' && pathname === '/') {
        redirect(response, '/overview');
        return;
      }

      if (method === 'POST' && pathname.startsWith('/actions/')) {
        const form = await readForm(request);
        const handled = await handleAction(pathname, form, response, client, store);
        if (handled) {
          return;
        }
      }

      const scopes = await store.listProjectScopes();
      const currentScope = readScope(url, scopes);
      const context: RouteContext = { config, store, scopes, currentScope };

      if (method === 'GET' && pathname === '/overview') {
        sendHtml(response, 200, await renderOverviewPage(context, pathname, url));
        return;
      }
      if (method === 'GET' && pathname === '/assets') {
        sendHtml(response, 200, await renderAssetsPage(context, pathname, url));
        return;
      }
      if (method === 'GET' && pathname === '/runs') {
        sendHtml(response, 200, await renderRunsPage(context, pathname, url));
        return;
      }
      if (method === 'GET' && pathname === '/ai-workspace') {
        sendHtml(response, 200, await renderAiWorkspacePage(context, pathname, url));
        return;
      }

      sendHtml(response, 404, '<h1>Not Found</h1>');
    } catch (error) {
      sendHtml(response, 500, `<pre>${escapeHtml((error as Error).stack ?? (error as Error).message)}</pre>`);
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
    baseUrl: `http://${config.hostname}:${config.port}`,
    async close() {
      await store.close();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
};
