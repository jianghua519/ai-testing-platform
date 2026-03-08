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
    --bg: #eef3f6;
    --bg-top: #f8fbfc;
    --panel: rgba(255, 255, 255, 0.94);
    --panel-strong: #ffffff;
    --panel-muted: #f7fafc;
    --line: rgba(15, 23, 42, 0.12);
    --line-strong: rgba(15, 23, 42, 0.22);
    --ink: #10202e;
    --muted: #5c6b79;
    --primary: #0f766e;
    --primary-soft: rgba(15, 118, 110, 0.12);
    --info: #155eef;
    --info-soft: rgba(21, 94, 239, 0.12);
    --success: #067647;
    --success-soft: rgba(6, 118, 71, 0.12);
    --warning: #b54708;
    --warning-soft: rgba(181, 71, 8, 0.12);
    --danger: #b42318;
    --danger-soft: rgba(180, 35, 24, 0.12);
    --neutral: #475467;
    --neutral-soft: rgba(71, 84, 103, 0.10);
    --nav: #101a24;
    --nav-soft: rgba(255, 255, 255, 0.7);
    --shadow: 0 16px 30px rgba(15, 23, 42, 0.08);
    --radius: 18px;
    --radius-small: 12px;
    --mono: "SFMono-Regular", "Cascadia Code", "JetBrains Mono", monospace;
    --sans: "IBM Plex Sans", "Aptos", "Segoe UI", "Helvetica Neue", sans-serif;
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: var(--ink);
    background:
      radial-gradient(circle at top left, rgba(15, 118, 110, 0.08), transparent 24%),
      radial-gradient(circle at top right, rgba(21, 94, 239, 0.08), transparent 20%),
      linear-gradient(180deg, var(--bg-top) 0%, var(--bg) 100%);
    font-family: var(--sans);
  }

  a { color: inherit; text-decoration: none; }

  .shell {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 270px minmax(0, 1fr);
  }

  .sidebar {
    background: linear-gradient(180deg, var(--nav) 0%, #172733 100%);
    color: #f8fafc;
    padding: 22px 18px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .logo {
    font-size: 24px;
    font-weight: 700;
    line-height: 1.1;
  }

  .sublogo {
    color: rgba(248, 250, 252, 0.65);
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    margin-top: 4px;
  }

  .nav-group {
    display: grid;
    gap: 8px;
  }

  .nav-link {
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    color: rgba(248, 250, 252, 0.82);
    background: rgba(255, 255, 255, 0.02);
    font-size: 14px;
    font-weight: 600;
  }

  .nav-link.active {
    color: white;
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.14);
  }

  .main {
    padding: 18px;
    display: grid;
    gap: 14px;
  }

  .topbar, .context-bar, .stat, .card, .list, .detail, .section, .filters, .flash {
    background: var(--panel);
    border: 1px solid var(--line);
    box-shadow: var(--shadow);
    backdrop-filter: blur(12px);
  }

  .topbar, .context-bar {
    border-radius: var(--radius);
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .scope-form, .header-actions, .inline-actions, .summary-badges {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .topbar-meta, .context-meta {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }

  .page {
    padding: 2px 0 0;
    display: grid;
    gap: 14px;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
    flex-wrap: wrap;
  }

  h1, h2, h3 {
    margin: 0;
    font-family: var(--sans);
    font-weight: 700;
  }

  h1 { font-size: 28px; line-height: 1.2; }
  h2 { font-size: 18px; line-height: 1.3; }
  h3 { font-size: 15px; line-height: 1.35; }

  .subtitle {
    color: var(--muted);
    margin-top: 4px;
    max-width: 72ch;
    line-height: 1.5;
    font-size: 14px;
  }

  .context-title {
    display: grid;
    gap: 4px;
  }

  .eyebrow {
    color: var(--muted);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .button, button, select, input, textarea {
    font: inherit;
  }

  .button, button {
    border: 0;
    border-radius: 10px;
    padding: 10px 14px;
    cursor: pointer;
    background: var(--ink);
    color: white;
    font-weight: 600;
  }

  .button.secondary, button.secondary {
    background: var(--panel-strong);
    color: var(--ink);
    border: 1px solid var(--line);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    padding: 4px 9px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    background: var(--neutral-soft);
    color: var(--neutral);
  }

  .badge.info { background: var(--info-soft); color: var(--info); }
  .badge.success { background: var(--success-soft); color: var(--success); }
  .badge.warning { background: var(--warning-soft); color: var(--warning); }
  .badge.danger { background: var(--danger-soft); color: var(--danger); }
  .badge.progress { background: var(--primary-soft); color: var(--primary); }

  .grid-4 {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .grid-2 {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .grid-3 {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .stat, .card, .detail, .section, .list, .filters, .flash {
    border-radius: var(--radius-small);
  }

  .stat, .card, .detail {
    padding: 14px;
  }

  .stat-value {
    font-size: 28px;
    font-weight: 700;
    line-height: 1;
    margin-top: 10px;
  }

  .meta {
    color: var(--muted);
    font-size: 13px;
  }

  .strong-meta {
    color: var(--ink);
    font-size: 13px;
    font-weight: 600;
  }

  .page-body {
    display: grid;
    grid-template-columns: 320px minmax(0, 1fr);
    gap: 14px;
    align-items: start;
  }

  .list {
    padding: 12px;
    display: grid;
    gap: 8px;
  }

  .list-item {
    border-radius: 12px;
    padding: 12px;
    border: 1px solid var(--line);
    background: var(--panel-muted);
    display: grid;
    gap: 6px;
  }

  .list-item.selected {
    border-color: rgba(15, 118, 110, 0.28);
    background: rgba(15, 118, 110, 0.08);
    box-shadow: inset 0 0 0 1px rgba(15, 118, 110, 0.08);
  }

  .list-item-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
  }

  .list-item-title {
    font-size: 15px;
    font-weight: 700;
    line-height: 1.35;
  }

  .list-item-subtitle {
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }

  .list-item-foot {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }

  .detail {
    display: grid;
    gap: 12px;
  }

  .section {
    padding: 14px;
    display: grid;
    gap: 12px;
  }

  .section-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .filters {
    padding: 14px;
    display: grid;
    gap: 12px;
  }

  .filter-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .filter-field, .field {
    display: grid;
    gap: 6px;
  }

  .field-label {
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .filter-actions {
    display: flex;
    gap: 8px;
    align-items: end;
    flex-wrap: wrap;
  }

  input, select, textarea {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: white;
    padding: 10px 12px;
    color: var(--ink);
  }

  textarea {
    min-height: 110px;
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

  .action-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .action-card {
    border-radius: 12px;
    border: 1px solid var(--line);
    background: var(--panel-muted);
    padding: 12px;
    display: grid;
    gap: 10px;
  }

  .action-card.compact {
    gap: 8px;
  }

  .form-grid {
    display: grid;
    gap: 10px;
  }

  .form-row, .summary-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .summary-grid.three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .summary-item {
    display: grid;
    gap: 4px;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: var(--panel-muted);
    padding: 10px 12px;
  }

  .summary-value {
    font-size: 14px;
    font-weight: 700;
    line-height: 1.35;
  }

  .tabs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .tab {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 9px 12px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--panel);
    color: var(--muted);
    font-size: 13px;
    font-weight: 700;
  }

  .tab.active {
    background: var(--ink);
    color: white;
    border-color: var(--ink);
  }

  .attention-list {
    display: grid;
    gap: 8px;
  }

  .raw-details, details.action-panel {
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 12px;
    background: var(--panel-muted);
  }

  .raw-details summary, details.action-panel summary {
    cursor: pointer;
    font-weight: 700;
  }

  .flash {
    padding: 12px 16px;
  }

  .flash.notice { border-color: rgba(15, 118, 110, 0.24); }
  .flash.error { border-color: rgba(180, 35, 24, 0.28); background: #fff5f5; }

  .empty {
    padding: 16px;
    border-radius: 12px;
    border: 1px dashed var(--line);
    color: var(--muted);
    background: rgba(255, 255, 255, 0.6);
  }

  .pagination {
    display: flex;
    gap: 8px;
    justify-content: space-between;
    align-items: center;
  }

  .mono { font-family: var(--mono); }

  .stack {
    display: grid;
    gap: 12px;
  }

  .divider {
    height: 1px;
    background: var(--line);
  }

  @media (max-width: 1080px) {
    .shell { grid-template-columns: 1fr; }
    .sidebar { border-radius: 0 0 24px 24px; }
    .page-body { grid-template-columns: 1fr; }
    .grid-4, .grid-3, .grid-2, .filter-grid, .action-grid, .form-row, .summary-grid, .summary-grid.three { grid-template-columns: 1fr; }
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
  if (['failed', 'error', 'stopped', 'canceled'].includes(value)) {
    return 'badge danger';
  }
  if (['warning', 'needs_publish', 'draft', 'queued', 'pending'].includes(value)) {
    return 'badge warning';
  }
  if (['running', 'active'].includes(value)) {
    return 'badge progress';
  }
  if (['passed', 'published', 'succeeded'].includes(value)) {
    return 'badge success';
  }
  if (['inline_web_plan', 'case_version', 'manual', 'auto_explore', 'run_replay'].includes(value)) {
    return 'badge info';
  }
  return 'badge';
};

const stringifyValue = (value: string | null | undefined): string => escapeHtml(value ?? '—');

const shortId = (value: string | null | undefined, head = 8, tail = 4): string => {
  if (!value?.trim()) {
    return '—';
  }
  if (value.length <= head + tail + 1) {
    return value;
  }
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
};

const formatDateTime = (value: string | null | undefined): string => {
  if (!value?.trim()) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const truncateText = (value: string | null | undefined, maxLength = 96): string => {
  if (!value?.trim()) {
    return '—';
  }
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
};

const formatUrlLabel = (value: string | null | undefined): string => {
  if (!value?.trim()) {
    return '—';
  }
  try {
    const url = new URL(value);
    return `${url.host}${url.pathname === '/' ? '' : url.pathname}`;
  } catch {
    return value;
  }
};

const renderSecondaryId = (id: string): string => `
  <span class="meta mono" title="${escapeHtml(id)}">ID ${escapeHtml(shortId(id))}</span>
`;

const displayRunName = (run: { id: string; name: string | null }): string => run.name?.trim() || `Run ${shortId(run.id, 6, 4)}`;

const displayThreadTitle = (thread: { id: string; title: string | null }): string =>
  thread.title?.trim() || `Thread ${shortId(thread.id, 6, 4)}`;

const displayExplorationName = (exploration: { id: string; name: string | null; startUrl?: string }): string =>
  exploration.name?.trim() || (exploration.startUrl ? `Explore ${formatUrlLabel(exploration.startUrl)}` : `Exploration ${shortId(exploration.id, 6, 4)}`);

const renderPageLink = (path: string, scope: ProjectScope | null, extra: Record<string, string | undefined> = {}): string =>
  `${path}${buildQueryString({ ...scopeParams(scope), ...extra })}`;

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
  <details class="raw-details action-panel">
    <summary>${escapeHtml(title)}</summary>
    <div style="margin-top: 14px; display: grid; gap: 12px;">${body}</div>
  </details>
`;

const renderField = (label: string, value: string): string => `
  <div class="summary-item">
    <div class="field-label">${escapeHtml(label)}</div>
    <div class="summary-value">${value}</div>
  </div>
`;

const renderStatus = (status: string): string => `<span class="${statusBadgeClass(status)}">${escapeHtml(status)}</span>`;

const renderSummaryField = (label: string, value: string, meta?: string): string => `
  <div class="summary-item">
    <div class="field-label">${escapeHtml(label)}</div>
    <div class="summary-value">${value}</div>
    ${meta ? `<div class="meta">${escapeHtml(meta)}</div>` : ''}
  </div>
`;

const renderActionCard = (title: string, description: string, body: string, id?: string): string => `
  <div class="action-card${body.includes('<button') && !body.includes('<textarea') ? ' compact' : ''}"${id ? ` id="${escapeHtml(id)}"` : ''}>
    <div>
      <h3>${escapeHtml(title)}</h3>
      <div class="meta">${escapeHtml(description)}</div>
    </div>
    ${body}
  </div>
`;

const renderRawJson = (title: string, value: unknown): string => `
  <details class="raw-details">
    <summary>${escapeHtml(title)}</summary>
    <div style="margin-top: 10px;"><pre>${escapeHtml(formatJson(value))}</pre></div>
  </details>
`;

const renderTabs = (
  tabs: Array<{ href: string; label: string; active: boolean }>,
): string => `
  <div class="tabs">
    ${tabs.map((tab) => `<a class="tab${tab.active ? ' active' : ''}" href="${escapeHtml(tab.href)}">${escapeHtml(tab.label)}</a>`).join('')}
  </div>
`;

const renderFilterField = (label: string, control: string): string => `
  <div class="filter-field">
    <label class="field-label">${escapeHtml(label)}</label>
    ${control}
  </div>
`;

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
      <label class="field-label" for="scope">Project Scope</label>
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
      </aside>
      <main class="main">
        <div class="context-bar">
          <div class="context-title">
            <div class="eyebrow">Current Scope</div>
            ${input.scopes.length ? renderProjectSwitcher(input.pathname, input.scopes, input.currentScope) : '<div class="meta">No project scopes discovered yet.</div>'}
          </div>
          <div class="context-meta">
            ${input.currentScope ? `<span class="badge">${escapeHtml(input.currentScope.tenantId)}</span><span class="badge">${escapeHtml(input.currentScope.projectId)}</span>` : ''}
            ${input.systemStatus ? `<span class="badge progress">${input.systemStatus.onlineAgents} agents</span><span class="badge${input.systemStatus.queuedItems > 0 ? ' warning' : ''}">queue ${input.systemStatus.queuedItems}</span>` : ''}
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
        <div class="subtitle">先看需要处理的对象，再看当前项目在 PostgreSQL / MinIO 里已经持有的内容。</div>
      </div>
      <div class="header-actions">
        <a class="button" href="${escapeHtml(`/runs${query}`)}">Open Runs</a>
        <a class="button secondary" href="${escapeHtml(`/assets${query}`)}">Open Assets</a>
      </div>
    </div>
  `;
  const pageBody = !ctx.currentScope || !overview
    ? `<div class="empty">Select a tenant/project pair after data exists in PostgreSQL.</div>`
    : `
      <div class="grid-4">
        ${renderStatCard('Failed Runs', String(overview.failedRunCount), `${overview.activeRunCount} active · ${overview.runCount} total runs`)}
        ${renderStatCard('Pending Publish', String(overview.attentionPublishableCases.length), `${overview.testCaseCount} test cases stored`)}
        ${renderStatCard('Open Explorations', String(overview.attentionExplorations.length), formatCountSummary(overview.explorationStatuses))}
        ${renderStatCard('Artifacts', String(overview.artifactCount), `${formatBytes(overview.artifactBytes)} in metadata-indexed storage`)}
      </div>
      <div class="grid-3">
        <div class="card">
          <div class="section-head">
            <h2>Failed Runs</h2>
            <a class="button secondary" href="${escapeHtml(renderPageLink('/runs', ctx.currentScope, { status: 'failed' }))}">View all</a>
          </div>
          <div class="attention-list">
            ${overview.attentionFailedRuns.length
              ? overview.attentionFailedRuns.map((item) => `
                <a class="list-item" href="${escapeHtml(renderPageLink('/runs', ctx.currentScope, { run_id: item.id }))}">
                  <div class="list-item-head">
                    <div class="list-item-title">${escapeHtml(displayRunName(item))}</div>
                    <div class="summary-badges">${renderStatus(item.status)}${item.selectionKind ? renderStatus(item.selectionKind) : ''}</div>
                  </div>
                  <div class="list-item-subtitle">${escapeHtml(item.selectionKind ? `Selection ${item.selectionKind}` : 'Run requires inspection')}</div>
                  <div class="list-item-foot">
                    <span class="meta">Updated ${escapeHtml(formatDateTime(item.updatedAt))}</span>
                    ${renderSecondaryId(item.id)}
                  </div>
                </a>
              `).join('')
              : '<div class="empty">No failed runs in the current project.</div>'}
          </div>
        </div>
        <div class="card">
          <div class="section-head">
            <h2>Cases Pending Publish</h2>
            <a class="button secondary" href="${escapeHtml(renderPageLink('/assets', ctx.currentScope, { asset_type: 'test-cases', status: 'draft' }))}">Open cases</a>
          </div>
          <div class="attention-list">
            ${overview.attentionPublishableCases.length
              ? overview.attentionPublishableCases.map((item) => `
                <a class="list-item" href="${escapeHtml(renderPageLink('/assets', ctx.currentScope, { asset_type: 'test-cases', asset_id: item.id }))}">
                  <div class="list-item-head">
                    <div class="list-item-title">${escapeHtml(item.name)}</div>
                    <div class="summary-badges"><span class="badge warning">needs publish</span>${renderStatus(item.status)}</div>
                  </div>
                  <div class="list-item-subtitle">
                    ${escapeHtml(item.latestPublishedVersionId
                      ? `Latest ${shortId(item.latestVersionId)} is newer than published ${shortId(item.latestPublishedVersionId)}`
                      : `Latest ${shortId(item.latestVersionId)} has not been published yet`)}
                  </div>
                  <div class="list-item-foot">
                    <span class="meta">Updated ${escapeHtml(formatDateTime(item.updatedAt))}</span>
                    ${renderSecondaryId(item.id)}
                  </div>
                </a>
              `).join('')
              : '<div class="empty">All latest case versions are already published.</div>'}
          </div>
        </div>
        <div class="card">
          <div class="section-head">
            <h2>Explorations Requiring Follow-up</h2>
            <a class="button secondary" href="${escapeHtml(renderPageLink('/ai-workspace', ctx.currentScope, { workspace_view: 'explorations' }))}">Open workspace</a>
          </div>
          <div class="attention-list">
            ${overview.attentionExplorations.length
              ? overview.attentionExplorations.map((item) => `
                <a class="list-item" href="${escapeHtml(renderPageLink('/ai-workspace', ctx.currentScope, { workspace_view: 'explorations', exploration_id: item.id }))}">
                  <div class="list-item-head">
                    <div class="list-item-title">${escapeHtml(displayExplorationName(item))}</div>
                    <div class="summary-badges">${renderStatus(item.status)}${item.recordingId ? '<span class="badge info">recording linked</span>' : ''}</div>
                  </div>
                  <div class="list-item-subtitle">${escapeHtml(formatUrlLabel(item.startUrl))}</div>
                  <div class="list-item-foot">
                    <span class="meta">Updated ${escapeHtml(formatDateTime(item.updatedAt))}</span>
                    ${renderSecondaryId(item.id)}
                  </div>
                </a>
              `).join('')
              : '<div class="empty">No draft, running, failed, or stopped explorations right now.</div>'}
          </div>
        </div>
      </div>
      <div class="card stack">
        <div class="section-head">
          <h2>Object Coverage</h2>
          ${systemStatus ? `<span class="meta">${systemStatus.onlineAgents} agents online · queue ${systemStatus.queuedItems}</span>` : ''}
        </div>
        <div class="summary-grid three">
          ${renderSummaryField('Assets', `${overview.testCaseCount} cases / ${overview.recordingCount} recordings`, `${overview.recordingAnalysisCount} analyses · ${formatCountSummary(overview.testCaseStatuses)}`)}
          ${renderSummaryField('Runs', `${overview.runCount} runs`, `${overview.activeRunCount} active · ${overview.failedRunCount} failed`)}
          ${renderSummaryField('AI Workspace', `${overview.threadCount} threads / ${overview.explorationCount} explorations`, formatCountSummary(overview.explorationStatuses))}
          ${renderSummaryField('Artifacts', `${overview.artifactCount} files`, `${formatBytes(overview.artifactBytes)} indexed in DB`)}
          ${renderSummaryField('Artifact Types', String(overview.artifactTypes.length), formatCountSummary(overview.artifactTypes))}
          ${renderSummaryField('Analysis Status', String(overview.recordingAnalysisCount), formatCountSummary(overview.recordingAnalysisStatuses))}
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
        <div class="subtitle">围绕测试资产做最小闭环操作：一览、筛选、详情、编辑、发布和运行。</div>
      </div>
      <div class="header-actions">
        ${ctx.currentScope ? `<a class="button" href="${escapeHtml(assetType === 'recordings' ? '#create-recording' : '#create-test-case')}">${assetType === 'recordings' ? 'New Recording' : 'New Test Case'}</a>` : ''}
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

  const assetTabs = renderTabs([
    {
      href: renderPageLink(pathname, ctx.currentScope, { asset_type: 'test-cases' }),
      label: 'Test Cases',
      active: assetType === 'test-cases',
    },
    {
      href: renderPageLink(pathname, ctx.currentScope, { asset_type: 'recordings' }),
      label: 'Recordings',
      active: assetType === 'recordings',
    },
  ]);

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
      ${hiddenInput('asset_type', assetType)}
      <div class="filter-grid">
        ${renderFilterField('Search', `<input type="search" name="query" value="${escapeHtml(query)}" placeholder="${assetType === 'recordings' ? 'Recording name or ID' : 'Case name or ID'}">`)}
        ${renderFilterField('Status', `<select name="status">${renderOptions(status, ['all', 'draft', 'active', 'archived', 'queued', 'running', 'published', 'succeeded', 'failed', 'stopped'])}</select>`)}
        ${assetType === 'recordings'
          ? renderFilterField('Source', `<select name="source_type">${renderOptions(sourceType, ['all', 'manual', 'auto_explore', 'run_replay'])}</select>`)
          : renderFilterField('Focus', '<div class="meta">Covers cases, versions, templates, dataset rows, and latest linked run.</div>')}
        <div class="filter-actions">
          <button type="submit">Apply Filters</button>
          <a class="button secondary" href="${escapeHtml(renderPageLink(pathname, ctx.currentScope, { asset_type: assetType }))}">Reset</a>
        </div>
      </div>
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
    pageBody: `
      ${assetTabs}
      ${filterForm}
      <div class="page-body">
        <div class="list">
          <div class="section-head">
            <h2>${assetType === 'recordings' ? 'Recordings' : 'Test Cases'}</h2>
            <span class="meta">${listResult.items.length} items on this page</span>
          </div>
          ${listMarkup}
        </div>
        <div class="detail">
          ${renderNewAssetActions(ctx.currentScope, `${pathname}?${currentParams.toString()}`, assetType)}
          ${detailMarkup}
        </div>
      </div>
    `,
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
    const releaseMeta = item.latestVersionId && item.latestPublishedVersionId === item.latestVersionId
      ? 'Latest version already published'
      : item.latestVersionId
        ? `Latest draft ${shortId(item.latestVersionId)}`
        : 'No version yet';
    return `
      <a class="list-item${item.id === selectedId ? ' selected' : ''}" href="${escapeHtml(`${pathname}?${params.toString()}`)}">
        <div class="list-item-head">
          <div class="list-item-title">${escapeHtml(item.name)}</div>
          <div class="summary-badges">${renderStatus(item.status)}${item.latestVersionId && item.latestPublishedVersionId !== item.latestVersionId ? '<span class="badge warning">needs publish</span>' : ''}</div>
        </div>
        <div class="list-item-subtitle">${escapeHtml(releaseMeta)}</div>
        <div class="list-item-foot">
          <span class="meta">Updated ${escapeHtml(formatDateTime(item.updatedAt))}</span>
          ${renderSecondaryId(item.id)}
        </div>
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
        <div class="list-item-head">
          <div class="list-item-title">${escapeHtml(item.name)}</div>
          <div class="summary-badges">${renderStatus(item.status)}${renderStatus(item.sourceType)}</div>
        </div>
        <div class="list-item-subtitle">Source ${escapeHtml(item.sourceType)} · recording asset</div>
        <div class="list-item-foot">
          <span class="meta">Updated ${escapeHtml(formatDateTime(item.updatedAt))}</span>
          ${renderSecondaryId(item.id)}
        </div>
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
  const releaseState = detail.latestVersionId && detail.latestVersionId === detail.latestPublishedVersionId
    ? 'Latest version is published'
    : detail.latestVersionId
      ? 'Latest version is still draft'
      : 'No version created yet';
  const versionRows = detail.versions.length
    ? `
      <table>
        <thead><tr><th>Version</th><th>Status</th><th>Source</th><th>Created</th><th></th></tr></thead>
        <tbody>
          ${detail.versions.map((version) => `
            <tr>
              <td>v${version.versionNo}${version.versionLabel ? ` · ${escapeHtml(version.versionLabel)}` : ''}</td>
              <td>${renderStatus(version.status)}</td>
              <td>${escapeHtml(version.sourceRecordingId ? `Recording ${shortId(version.sourceRecordingId)}` : version.sourceRunId ? `Run ${shortId(version.sourceRunId)}` : 'manual')}</td>
              <td>${escapeHtml(formatDateTime(version.createdAt))}</td>
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
  const datasetRowsTable = detail.datasetRows.length
    ? `<table><thead><tr><th>Row</th><th>Status</th><th>Updated</th><th>Role</th></tr></thead><tbody>${detail.datasetRows.map((row) => `
      <tr>
        <td>${escapeHtml(row.name)}</td>
        <td>${renderStatus(row.status)}</td>
        <td>${escapeHtml(formatDateTime(row.updatedAt))}</td>
        <td>${row.id === latestVersion?.defaultDatasetRowId ? '<span class="badge info">default</span>' : '<span class="meta">optional</span>'}</td>
      </tr>
    `).join('')}</tbody></table>`
    : '<div class="empty">No dataset rows on the latest version.</div>';
  const datasetEditors = detail.datasetRows.length
    ? detail.datasetRows.map((row) => `
      <details class="raw-details">
        <summary>${escapeHtml(row.name)} · edit values</summary>
        <form method="post" action="/actions/dataset-rows/update" class="form-grid" style="margin-top:12px;">
          ${hiddenInput('tenant_id', scope.tenantId)}
          ${hiddenInput('project_id', scope.projectId)}
          ${hiddenInput('dataset_row_id', row.id)}
          ${hiddenInput('return_to', returnTo)}
          <div class="field">
            <label class="field-label">Row Name</label>
            <input name="name" value="${escapeHtml(row.name)}">
          </div>
          <div class="field">
            <label class="field-label">Values JSON</label>
            <textarea name="values_json">${escapeHtml(formatJson(row.values))}</textarea>
          </div>
          <button type="submit">Save Dataset Row</button>
        </form>
      </details>
    `).join('')
    : '';

  return `
    <div class="section">
      <div class="section-head">
        <h2>${escapeHtml(detail.name)}</h2>
        <div class="summary-badges">${renderStatus(detail.status)}${detail.latestVersionId && detail.latestVersionId !== detail.latestPublishedVersionId ? '<span class="badge warning">needs publish</span>' : '<span class="badge success">release aligned</span>'}</div>
      </div>
      <div class="summary-grid three">
        ${renderField('Latest Version', escapeHtml(latestVersion ? `v${latestVersion.versionNo}${latestVersion.versionLabel ? ` · ${latestVersion.versionLabel}` : ''}` : '—'))}
        ${renderField('Release State', escapeHtml(releaseState))}
        ${renderField('Dataset Rows', String(detail.datasetRows.length))}
        ${renderField('Versions', String(detail.versions.length))}
        ${renderField('Created', escapeHtml(formatDateTime(detail.createdAt)))}
        ${renderField('Updated', escapeHtml(formatDateTime(detail.updatedAt)))}
      </div>
      <div class="list-item-foot">
        ${detail.latestRun ? `<a class="button secondary" href="${escapeHtml(renderPageLink('/runs', scope, { run_id: detail.latestRun.id }))}">Open Latest Run</a>` : '<span class="meta">No linked run yet.</span>'}
        ${renderSecondaryId(detail.id)}
      </div>
    </div>
    <div class="section">
      <div class="section-head"><h3>Version History</h3></div>
      ${versionRows}
    </div>
    <div class="section">
      <div class="section-head"><h3>Template and Dataset</h3></div>
      <div class="summary-grid">
        ${renderField('Template Version', escapeHtml(detail.dataTemplate ? shortId(detail.dataTemplate.versionId) : '—'))}
        ${renderField('Default Dataset Row', escapeHtml(latestVersion?.defaultDatasetRowId ? shortId(latestVersion.defaultDatasetRowId) : '—'))}
      </div>
      ${datasetRowsTable}
      ${detail.dataTemplate
        ? renderRawJson('Raw data template', detail.dataTemplate)
        : '<div class="empty">No data template found.</div>'}
      ${datasetEditors}
    </div>
    <div class="section">
      <div class="section-head"><h3>Actions</h3></div>
      <div class="action-grid">
        ${renderActionCard('Edit Case', 'Rename or change the lifecycle state of this test case.', `
          <form method="post" action="/actions/test-cases/update" class="form-grid">
            ${hiddenInput('tenant_id', scope.tenantId)}
            ${hiddenInput('project_id', scope.projectId)}
            ${hiddenInput('test_case_id', detail.id)}
            ${hiddenInput('return_to', returnTo)}
            <div class="field">
              <label class="field-label">Case Name</label>
              <input name="name" value="${escapeHtml(detail.name)}">
            </div>
            <div class="field">
              <label class="field-label">Status</label>
              <select name="status">${renderOptions(detail.status, ['draft', 'active', 'archived'])}</select>
            </div>
            <button type="submit">Save Case</button>
          </form>
        `)}
        ${renderActionCard('Create Version', 'Add a new draft version and optionally publish it immediately.', `
          <form method="post" action="/actions/test-cases/create-version" class="form-grid">
            ${hiddenInput('tenant_id', scope.tenantId)}
            ${hiddenInput('project_id', scope.projectId)}
            ${hiddenInput('test_case_id', detail.id)}
            ${hiddenInput('return_to', returnTo)}
            <div class="form-row">
              <div class="field">
                <label class="field-label">Version Label</label>
                <input name="version_label" placeholder="Version label" value="console-update">
              </div>
              <div class="field">
                <label class="field-label">Change Summary</label>
                <input name="change_summary" placeholder="Change summary" value="created from console">
              </div>
            </div>
            <label class="meta"><input type="checkbox" name="publish" value="true"> Publish immediately</label>
            <details class="raw-details">
              <summary>Advanced payload</summary>
              <div class="form-grid" style="margin-top: 12px;">
                <div class="field">
                  <label class="field-label">Plan JSON</label>
                  <textarea name="plan_json">${escapeHtml(formatJson(latestVersion?.plan ?? DEFAULT_PLAN))}</textarea>
                </div>
                <div class="field">
                  <label class="field-label">Environment Profile JSON</label>
                  <textarea name="env_profile_json">${escapeHtml(formatJson(latestVersion?.envProfile ?? DEFAULT_ENV_PROFILE))}</textarea>
                </div>
              </div>
            </details>
            <button type="submit">Create Version</button>
          </form>
        `)}
        ${renderActionCard('Dataset Operations', 'Create rows and bind the default row used by the latest version.', `
          <div class="form-grid">
            <form method="post" action="/actions/test-case-versions/create-dataset-row" class="form-grid">
              ${hiddenInput('tenant_id', scope.tenantId)}
              ${hiddenInput('project_id', scope.projectId)}
              ${hiddenInput('version_id', latestVersion?.id ?? '')}
              ${hiddenInput('return_to', returnTo)}
              <div class="field">
                <label class="field-label">New Row Name</label>
                <input name="name" placeholder="Dataset row name" value="console-row">
              </div>
              <div class="field">
                <label class="field-label">Values JSON</label>
                <textarea name="values_json">{}</textarea>
              </div>
              <button type="submit"${latestVersion ? '' : ' disabled'}>Create Dataset Row</button>
            </form>
            <div class="divider"></div>
            <form method="post" action="/actions/test-case-versions/bind-default-dataset" class="form-grid">
              ${hiddenInput('tenant_id', scope.tenantId)}
              ${hiddenInput('project_id', scope.projectId)}
              ${hiddenInput('version_id', latestVersion?.id ?? '')}
              ${hiddenInput('return_to', returnTo)}
              <div class="field">
                <label class="field-label">Default Row</label>
                <select name="dataset_row_id">
                  ${detail.datasetRows.map((row) => `<option value="${escapeHtml(row.id)}"${row.id === latestVersion?.defaultDatasetRowId ? ' selected' : ''}>${escapeHtml(row.name)}</option>`).join('')}
                </select>
              </div>
              <button type="submit"${latestVersion && detail.datasetRows.length ? '' : ' disabled'}>Bind Default Row</button>
            </form>
          </div>
        `)}
        ${renderActionCard('Run or Archive', 'Run the latest published version, or archive this case when it is no longer used.', `
          <div class="form-grid">
            <form method="post" action="/actions/test-cases/run-latest-published" class="form-grid">
              ${hiddenInput('tenant_id', scope.tenantId)}
              ${hiddenInput('project_id', scope.projectId)}
              ${hiddenInput('test_case_id', detail.id)}
              ${hiddenInput('return_to', returnTo)}
              <div class="field">
                <label class="field-label">Run Name</label>
                <input name="name" value="${escapeHtml(`${detail.name} replay`)}">
              </div>
              <div class="field">
                <label class="field-label">Dataset Row ID</label>
                <input name="dataset_row_id" value="${escapeHtml(latestVersion?.defaultDatasetRowId ?? '')}" placeholder="Optional dataset row id">
              </div>
              <button type="submit"${detail.latestPublishedVersionId ? '' : ' disabled'}>Run Latest Published</button>
            </form>
            <form method="post" action="/actions/test-cases/archive">
              ${hiddenInput('tenant_id', scope.tenantId)}
              ${hiddenInput('project_id', scope.projectId)}
              ${hiddenInput('test_case_id', detail.id)}
              ${hiddenInput('return_to', returnTo)}
              <button type="submit" class="secondary">Archive Test Case</button>
            </form>
          </div>
        `)}
      </div>
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
        <div class="summary-badges">${renderStatus(detail.status)}${renderStatus(detail.sourceType)}</div>
      </div>
      <div class="summary-grid three">
        ${renderField('Started', escapeHtml(formatDateTime(detail.startedAt)))}
        ${renderField('Finished', escapeHtml(formatDateTime(detail.finishedAt ?? '—')))}
        ${renderField('Events', String(detail.events.length))}
        ${renderField('Analysis Jobs', String(detail.analysisJobs.length))}
        ${renderField('Derived Cases', String(detail.derivedCases.length))}
        ${renderField('Source', escapeHtml(detail.sourceType))}
      </div>
      <div class="list-item-foot">
        <span class="meta">Updated ${escapeHtml(formatDateTime(detail.updatedAt))}</span>
        ${renderSecondaryId(detail.id)}
      </div>
    </div>
    <div class="section">
      <div class="section-head"><h3>Recording Events</h3></div>
      ${detail.events.length ? `<table><thead><tr><th>#</th><th>Type</th><th>Page</th><th>Captured</th></tr></thead><tbody>${detail.events.map((event) => `<tr><td>${event.seqNo}</td><td>${escapeHtml(event.eventType)}</td><td>${escapeHtml(formatUrlLabel(event.pageUrl ?? '—'))}</td><td>${escapeHtml(formatDateTime(event.capturedAt))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No recording events.</div>'}
    </div>
    <div class="section">
      <div class="section-head"><h3>Analysis Jobs</h3></div>
      ${detail.analysisJobs.length ? `<table><thead><tr><th>Job</th><th>Status</th><th>Started</th><th>Finished</th></tr></thead><tbody>${detail.analysisJobs.map((job) => `<tr><td title="${escapeHtml(job.id)}">${escapeHtml(shortId(job.id))}</td><td>${renderStatus(job.status)}</td><td>${escapeHtml(formatDateTime(job.startedAt))}</td><td>${escapeHtml(formatDateTime(job.finishedAt ?? '—'))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No analysis jobs yet.</div>'}
    </div>
    <div class="section">
      <div class="section-head"><h3>Derived Cases</h3></div>
      ${detail.derivedCases.length ? `<table><thead><tr><th>Case</th><th>Version</th><th>Status</th><th>Created</th></tr></thead><tbody>${detail.derivedCases.map((item) => `<tr><td><a href="${escapeHtml(renderPageLink('/assets', scope, { asset_type: 'test-cases', asset_id: item.testCaseId }))}">${escapeHtml(item.caseName)}</a></td><td title="${escapeHtml(item.versionId)}">${escapeHtml(shortId(item.versionId))}</td><td>${renderStatus(item.status)}</td><td>${escapeHtml(formatDateTime(item.createdAt))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No derived cases yet.</div>'}
    </div>
    <div class="section">
      <div class="section-head"><h3>Actions</h3></div>
      <div class="action-grid">
        ${renderActionCard('Analyze DSL', 'Start the current recording analysis job against this source recording.', `
          <form method="post" action="/actions/recordings/analyze">
            ${hiddenInput('tenant_id', scope.tenantId)}
            ${hiddenInput('project_id', scope.projectId)}
            ${hiddenInput('recording_id', detail.id)}
            ${hiddenInput('return_to', returnTo)}
            <button type="submit">Analyze DSL</button>
          </form>
        `)}
        ${renderActionCard('Publish as Test Case', 'Create a case from this recording and optionally publish the first version.', `
          <form method="post" action="/actions/recordings/publish" class="form-grid">
            ${hiddenInput('tenant_id', scope.tenantId)}
            ${hiddenInput('project_id', scope.projectId)}
            ${hiddenInput('recording_id', detail.id)}
            ${hiddenInput('return_to', returnTo)}
            <div class="field">
              <label class="field-label">Case Name</label>
              <input name="name" value="${escapeHtml(`${detail.name} case`)}">
            </div>
            <div class="form-row">
              <div class="field">
                <label class="field-label">Version Label</label>
                <input name="version_label" value="recording-v1">
              </div>
              <div class="field">
                <label class="field-label">Change Summary</label>
                <input name="change_summary" value="published from console">
              </div>
            </div>
            <label class="meta"><input type="checkbox" name="publish" value="true" checked> Publish immediately</label>
            <details class="raw-details">
              <summary>Default dataset JSON</summary>
              <div class="field" style="margin-top: 12px;">
                <textarea name="default_dataset_json">{}</textarea>
              </div>
            </details>
            <button type="submit">Publish Test Case</button>
          </form>
        `)}
      </div>
      ${renderRawJson('Raw environment profile', detail.envProfile)}
    </div>
  `;
};

const renderNewAssetActions = (scope: ProjectScope | null, returnTo: string, assetType: 'test-cases' | 'recordings'): string => {
  if (!scope) {
    return '';
  }
  if (assetType === 'recordings') {
    return renderActionCard('New Recording', 'Create a recording object backed by the current project scope.', `
      <form method="post" action="/actions/recordings/create" class="form-grid">
        ${hiddenInput('tenant_id', scope.tenantId)}
        ${hiddenInput('project_id', scope.projectId)}
        ${hiddenInput('return_to', returnTo)}
        <div class="field">
          <label class="field-label">Recording Name</label>
          <input name="name" value="console-recording">
        </div>
        <div class="field">
          <label class="field-label">Source Type</label>
          <select name="source_type">${renderOptions('manual', ['manual', 'auto_explore', 'run_replay'])}</select>
        </div>
        <details class="raw-details">
          <summary>Environment profile JSON</summary>
          <div class="field" style="margin-top: 12px;">
            <textarea name="env_profile_json">${escapeHtml(formatJson(DEFAULT_ENV_PROFILE))}</textarea>
          </div>
        </details>
        <button type="submit">Create Recording</button>
      </form>
    `, 'create-recording');
  }
  return renderActionCard('New Test Case', 'Create a case, seed the first version, and optionally publish it.', `
    <form method="post" action="/actions/test-cases/create" class="form-grid">
      ${hiddenInput('tenant_id', scope.tenantId)}
      ${hiddenInput('project_id', scope.projectId)}
      ${hiddenInput('return_to', returnTo)}
      <div class="field">
        <label class="field-label">Case Name</label>
        <input name="name" value="console-test-case">
      </div>
      <div class="form-row">
        <div class="field">
          <label class="field-label">Version Label</label>
          <input name="version_label" value="v1">
        </div>
        <div class="field">
          <label class="field-label">Change Summary</label>
          <input name="change_summary" value="created from console">
        </div>
      </div>
      <label class="meta"><input type="checkbox" name="publish" value="true"> Publish immediately</label>
      <details class="raw-details">
        <summary>Advanced plan and environment payload</summary>
        <div class="form-grid" style="margin-top: 12px;">
          <div class="field">
            <label class="field-label">Plan JSON</label>
            <textarea name="plan_json">${escapeHtml(formatJson(DEFAULT_PLAN))}</textarea>
          </div>
          <div class="field">
            <label class="field-label">Environment Profile JSON</label>
            <textarea name="env_profile_json">${escapeHtml(formatJson(DEFAULT_ENV_PROFILE))}</textarea>
          </div>
          <div class="field">
            <label class="field-label">Default Dataset JSON</label>
            <textarea name="default_dataset_json">{}</textarea>
          </div>
        </div>
      </details>
      <button type="submit">Create Test Case</button>
    </form>
  `, 'create-test-case');
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
        <div class="subtitle">围绕运行结果做判断和处置：看失败、看证据、评估、自愈、抽取用例。</div>
      </div>
      <div class="header-actions">
        ${ctx.currentScope ? '<a class="button" href="#create-run">New Run</a>' : ''}
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
      <div class="filter-grid">
        ${renderFilterField('Search', `<input type="search" name="query" value="${escapeHtml(queryValue)}" placeholder="Run name or ID">`)}
        ${renderFilterField('Status', `<select name="status">${renderOptions(status, ['all', 'queued', 'running', 'passed', 'failed', 'canceled'])}</select>`)}
        ${renderFilterField('Selection', `<select name="selection_kind">${renderOptions(selectionKind, ['all', 'inline_web_plan', 'case_version'])}</select>`)}
        <div class="filter-actions">
          <button type="submit">Apply Filters</button>
          <a class="button secondary" href="${escapeHtml(renderPageLink(pathname, ctx.currentScope))}">Reset</a>
        </div>
      </div>
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
    pageBody: `
      ${filterForm}
      <div class="page-body">
        <div class="list">
          <div class="section-head">
            <h2>Run Queue</h2>
            <span class="meta">${listResult.items.length} items on this page</span>
          </div>
          ${listMarkup}
        </div>
        <div class="detail">
          ${ctx.currentScope ? renderNewRunAction(ctx.currentScope, `${pathname}?${currentParams.toString()}`) : ''}
          ${detailMarkup}
        </div>
      </div>
    `,
  });
};

const renderRunList = (pathname: string, params: URLSearchParams, listResult: PageResult<RunListItem>, selectedRunId: string | null): string => {
  const items = listResult.items.map((item) => {
    const next = new URLSearchParams(params);
    next.set('run_id', item.id);
    return `
      <a class="list-item${item.id === selectedRunId ? ' selected' : ''}" href="${escapeHtml(`${pathname}?${next.toString()}`)}">
        <div class="list-item-head">
          <div class="list-item-title">${escapeHtml(displayRunName(item))}</div>
          <div class="summary-badges">${renderStatus(item.status)}${item.selectionKind ? renderStatus(item.selectionKind) : ''}</div>
        </div>
        <div class="list-item-subtitle">${escapeHtml(item.selectionKind ? `Selection ${item.selectionKind}` : 'Run record')}</div>
        <div class="list-item-foot">
          <span class="meta">Updated ${escapeHtml(formatDateTime(item.updatedAt))}</span>
          ${renderSecondaryId(item.id)}
        </div>
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
  const selectedRunItem = detail.runItems.find((item) => item.id === detail.selectedRunItemId) ?? null;
  const runItemRows = detail.runItems.length
    ? detail.runItems.map((item) => {
        const next = new URLSearchParams(params);
        next.set('run_id', detail.id);
        next.set('run_item_id', item.id);
        return `
          <tr>
            <td><a href="${escapeHtml(`${pathname}?${next.toString()}`)}" title="${escapeHtml(item.id)}">Item ${escapeHtml(shortId(item.id))}</a></td>
            <td>${renderStatus(item.status)}</td>
            <td>${escapeHtml(item.jobKind)}</td>
            <td title="${escapeHtml(item.testCaseVersionId ?? '')}">${escapeHtml(item.testCaseVersionId ? shortId(item.testCaseVersionId) : '—')}</td>
            <td title="${escapeHtml(item.datasetRowId ?? '')}">${escapeHtml(item.datasetRowId ? shortId(item.datasetRowId) : '—')}</td>
            <td title="${escapeHtml(item.assignedAgentId ?? '')}">${escapeHtml(item.assignedAgentId ? shortId(item.assignedAgentId) : '—')}</td>
          </tr>
        `;
      }).join('')
    : '';

  return `
    <div class="section">
      <div class="section-head">
        <h2>${escapeHtml(displayRunName(detail))}</h2>
        <div class="summary-badges">${renderStatus(detail.status)}${detail.selectionKind ? renderStatus(detail.selectionKind) : ''}</div>
      </div>
      <div class="summary-grid three">
        ${renderField('Mode', escapeHtml(detail.mode ?? '—'))}
        ${renderField('Selection', escapeHtml(detail.selectionKind ?? '—'))}
        ${renderField('Run Items', String(detail.runItems.length))}
        ${renderField('Artifacts', String(detail.artifacts.length))}
        ${renderField('Started', escapeHtml(formatDateTime(detail.startedAt ?? '—')))}
        ${renderField('Finished', escapeHtml(formatDateTime(detail.finishedAt ?? '—')))}
      </div>
      <div class="list-item-foot">
        <span class="meta">Updated ${escapeHtml(formatDateTime(detail.updatedAt))}</span>
        ${renderSecondaryId(detail.id)}
      </div>
      <div class="meta mono">Last event ${escapeHtml(shortId(detail.lastEventId))}</div>
    </div>
    <div class="section">
      <div class="section-head"><h3>Selected Run Item</h3></div>
      ${selectedRunItem ? `
        <div class="summary-grid three">
          ${renderField('Run Item', escapeHtml(shortId(selectedRunItem.id)))}
          ${renderField('Attempt', String(selectedRunItem.attemptNo))}
          ${renderField('Job Kind', escapeHtml(selectedRunItem.jobKind))}
          ${renderField('Case Version', escapeHtml(selectedRunItem.testCaseVersionId ? shortId(selectedRunItem.testCaseVersionId) : '—'))}
          ${renderField('Dataset', escapeHtml(selectedRunItem.datasetRowId ? shortId(selectedRunItem.datasetRowId) : '—'))}
          ${renderField('Agent', escapeHtml(selectedRunItem.assignedAgentId ? shortId(selectedRunItem.assignedAgentId) : '—'))}
        </div>
      ` : '<div class="empty">This run does not have a selected run item yet.</div>'}
    </div>
    <div class="section">
      <div class="section-head"><h3>Run Items</h3></div>
      ${runItemRows ? `<table><thead><tr><th>Run Item</th><th>Status</th><th>Job Kind</th><th>Case Version</th><th>Dataset</th><th>Agent</th></tr></thead><tbody>${runItemRows}</tbody></table>` : '<div class="empty">No run items.</div>'}
    </div>
    <div class="section">
      <div class="section-head"><h3>Step Events</h3></div>
      ${detail.stepEvents.length ? `<table><thead><tr><th>Step</th><th>Status</th><th>Started</th><th>Finished</th><th>Duration</th><th>Error</th></tr></thead><tbody>${detail.stepEvents.map((event) => `<tr><td class="mono">${escapeHtml(event.sourceStepId)}</td><td>${renderStatus(event.status)}</td><td>${escapeHtml(formatDateTime(event.startedAt))}</td><td>${escapeHtml(formatDateTime(event.finishedAt))}</td><td>${event.durationMs}ms</td><td>${escapeHtml(event.errorCode ?? '—')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No step events for the selected run item.</div>'}
    </div>
    <div class="section">
      <div class="section-head"><h3>Evidence</h3></div>
      ${detail.artifacts.length ? `<table><thead><tr><th>Artifact</th><th>Content Type</th><th>Size</th><th>Created</th><th></th></tr></thead><tbody>${detail.artifacts.map((artifact) => `<tr><td>${escapeHtml(artifact.artifactType)}</td><td>${escapeHtml(artifact.contentType ?? '—')}</td><td>${escapeHtml(artifact.sizeBytes === null ? '—' : formatBytes(artifact.sizeBytes))}</td><td>${escapeHtml(formatDateTime(artifact.createdAt))}</td><td>${renderArtifactLink(artifact, controlPlanePublicBaseUrl)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No artifacts for the selected run item.</div>'}
      <div class="meta">Artifact downloads are served through control-plane.</div>
    </div>
    <div class="section">
      <div class="section-head"><h3>AI Diagnostics</h3></div>
      <div class="grid-2">
        <div>
          <div class="meta" style="margin-bottom:8px;">Self-heal Attempts</div>
          ${detail.selfHealAttempts.length ? detail.selfHealAttempts.map((attempt) => `<div class="list-item"><div class="list-item-head"><div class="list-item-title">Attempt ${escapeHtml(shortId(attempt.id))}</div><div class="summary-badges">${renderStatus(attempt.status)}${attempt.replayRunStatus ? renderStatus(attempt.replayRunStatus) : ''}</div></div><div class="list-item-subtitle">${escapeHtml(attempt.explanation ?? 'No explanation')}</div><div class="list-item-foot"><span class="meta">Created ${escapeHtml(formatDateTime(attempt.createdAt))}</span><span class="meta mono">Replay ${escapeHtml(attempt.replayRunId ? shortId(attempt.replayRunId) : '—')} · Derived ${escapeHtml(attempt.derivedTestCaseVersionId ? shortId(attempt.derivedTestCaseVersionId) : '—')}</span></div></div>`).join('') : '<div class="empty">No self-heal attempts yet.</div>'}
        </div>
        <div>
          <div class="meta" style="margin-bottom:8px;">Run Evaluations</div>
          ${detail.runEvaluations.length ? detail.runEvaluations.map((evaluation) => `<div class="list-item"><div class="list-item-head"><div class="list-item-title">Evaluation ${escapeHtml(shortId(evaluation.id))}</div><div class="summary-badges">${renderStatus(evaluation.verdict)}</div></div><div class="list-item-subtitle">${escapeHtml(evaluation.explanation)}</div><div class="list-item-foot"><span class="meta">Created ${escapeHtml(formatDateTime(evaluation.createdAt))}</span><span class="meta mono">${escapeHtml(evaluation.linkedArtifactIds.length ? evaluation.linkedArtifactIds.map((artifactId) => shortId(artifactId)).join(', ') : 'No linked artifacts')}</span></div></div>`).join('') : '<div class="empty">No run evaluations yet.</div>'}
        </div>
      </div>
    </div>
    <div class="section">
      <div class="section-head"><h3>Actions</h3></div>
      <div class="action-grid">
        ${renderActionCard('Cancel Run', 'Stop the current run when it should no longer continue.', `
          <form method="post" action="/actions/runs/cancel">
            ${hiddenInput('tenant_id', scope.tenantId)}
            ${hiddenInput('project_id', scope.projectId)}
            ${hiddenInput('run_id', detail.id)}
            ${hiddenInput('return_to', returnTo)}
            <button type="submit" class="secondary">Cancel Run</button>
          </form>
        `)}
        ${renderActionCard('Evaluate Selected Item', 'Run AI evaluation for the currently selected run item.', `
          <form method="post" action="/actions/run-items/evaluate">
            ${hiddenInput('tenant_id', scope.tenantId)}
            ${hiddenInput('project_id', scope.projectId)}
            ${hiddenInput('run_item_id', detail.selectedRunItemId ?? '')}
            ${hiddenInput('return_to', returnTo)}
            <button type="submit"${detail.selectedRunItemId ? '' : ' disabled'}>Evaluate Run Item</button>
          </form>
        `)}
        ${renderActionCard('Self-heal Selected Item', 'Ask AI to repair the selected failure and optionally derive a draft version.', `
          <form method="post" action="/actions/run-items/self-heal" class="form-grid">
            ${hiddenInput('tenant_id', scope.tenantId)}
            ${hiddenInput('project_id', scope.projectId)}
            ${hiddenInput('run_item_id', detail.selectedRunItemId ?? '')}
            ${hiddenInput('return_to', returnTo)}
            <label class="meta"><input type="checkbox" name="derive_draft_version" value="true" checked> Derive draft version on success</label>
            <button type="submit"${detail.selectedRunItemId ? '' : ' disabled'}>Start Self-heal</button>
          </form>
        `)}
        ${renderActionCard('Extract Test Case', 'Turn the selected run item into a reusable test case.', `
          <form method="post" action="/actions/run-items/extract-test-case" class="form-grid">
            ${hiddenInput('tenant_id', scope.tenantId)}
            ${hiddenInput('project_id', scope.projectId)}
            ${hiddenInput('run_item_id', detail.selectedRunItemId ?? '')}
            ${hiddenInput('return_to', returnTo)}
            <div class="field">
              <label class="field-label">Case Name</label>
              <input name="name" value="console-extracted-case">
            </div>
            <div class="form-row">
              <div class="field">
                <label class="field-label">Version Label</label>
                <input name="version_label" value="derived-v1">
              </div>
              <div class="field">
                <label class="field-label">Change Summary</label>
                <input name="change_summary" value="extracted from console">
              </div>
            </div>
            <label class="meta"><input type="checkbox" name="publish" value="true"> Publish immediately</label>
            <button type="submit"${detail.selectedRunItemId ? '' : ' disabled'}>Extract Case</button>
          </form>
        `)}
      </div>
    </div>
  `;
};

const renderNewRunAction = (scope: ProjectScope, returnTo: string): string => renderActionCard('New Run', 'Create a run from an inline plan or an existing case version.', `
  <form method="post" action="/actions/runs/create" class="form-grid">
    ${hiddenInput('tenant_id', scope.tenantId)}
    ${hiddenInput('project_id', scope.projectId)}
    ${hiddenInput('return_to', returnTo)}
    <div class="field">
      <label class="field-label">Run Name</label>
      <input name="name" value="console-run">
    </div>
    <div class="form-row">
      <div class="field">
        <label class="field-label">Selection Kind</label>
        <select name="selection_kind">${renderOptions('inline_web_plan', ['inline_web_plan', 'case_version'])}</select>
      </div>
      <div class="field">
        <label class="field-label">Dataset Row ID</label>
        <input name="dataset_row_id" placeholder="Optional dataset row id">
      </div>
    </div>
    <div class="field">
      <label class="field-label">Case Version ID</label>
      <input name="case_version_id" placeholder="Required for case_version runs">
    </div>
    <details class="raw-details">
      <summary>Inline plan payload</summary>
      <div class="form-grid" style="margin-top: 12px;">
        <div class="field">
          <label class="field-label">Plan JSON</label>
          <textarea name="plan_json">${escapeHtml(formatJson(DEFAULT_PLAN))}</textarea>
        </div>
        <div class="field">
          <label class="field-label">Environment Profile JSON</label>
          <textarea name="env_profile_json">${escapeHtml(formatJson(DEFAULT_ENV_PROFILE))}</textarea>
        </div>
      </div>
    </details>
    <button type="submit">Create Run</button>
  </form>
`, 'create-run');

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
        <div class="subtitle">把协作线程和浏览探索拆开管理，先看对象，再做消息、执行和发布动作。</div>
      </div>
      <div class="header-actions">
        ${ctx.currentScope ? `<a class="button" href="${escapeHtml(view === 'threads' ? '#create-thread' : '#create-exploration')}">${view === 'threads' ? 'New Thread' : 'New Exploration'}</a>` : ''}
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
  const workspaceTabs = renderTabs([
    {
      href: renderPageLink(pathname, ctx.currentScope, { workspace_view: 'threads' }),
      label: 'Threads',
      active: view === 'threads',
    },
    {
      href: renderPageLink(pathname, ctx.currentScope, { workspace_view: 'explorations' }),
      label: 'Explorations',
      active: view === 'explorations',
    },
  ]);
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
      ${hiddenInput('workspace_view', view)}
      <div class="filter-grid">
        ${renderFilterField('Search', `<input type="search" name="query" value="${escapeHtml(queryValue)}" placeholder="${view === 'threads' ? 'Thread title or ID' : 'Exploration name or ID'}">`)}
        ${view === 'explorations'
          ? renderFilterField('Status', `<select name="status">${renderOptions(status, ['all', 'draft', 'running', 'succeeded', 'failed', 'stopped'])}</select>`)
          : renderFilterField('Status', '<div class="meta">Threads currently support title search only.</div>')}
        ${renderFilterField('Object Model', `<div class="meta">${view === 'threads' ? 'Messages, memory facts, linked explorations' : 'Start URL, recording, artifacts, publish output'}</div>`)}
        <div class="filter-actions">
          <button type="submit">Apply Filters</button>
          <a class="button secondary" href="${escapeHtml(renderPageLink(pathname, ctx.currentScope, { workspace_view: view }))}">Reset</a>
        </div>
      </div>
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
    pageBody: `
      ${workspaceTabs}
      ${filterForm}
      <div class="page-body">
        <div class="list">
          <div class="section-head">
            <h2>${view === 'threads' ? 'Threads' : 'Explorations'}</h2>
            <span class="meta">${listResult.items.length} items on this page</span>
          </div>
          ${listMarkup}
        </div>
        <div class="detail">
          ${ctx.currentScope ? renderNewAiActions(ctx.currentScope, `${pathname}?${currentParams.toString()}`, view) : ''}
          ${detailMarkup}
        </div>
      </div>
    `,
  });
};

const renderNewAiActions = (scope: ProjectScope, returnTo: string, view: 'threads' | 'explorations'): string => {
  if (view === 'threads') {
    return renderActionCard('New Thread', 'Create a collaboration thread for assistant messages and memory facts.', `
      <form method="post" action="/actions/threads/create" class="form-grid">
        ${hiddenInput('tenant_id', scope.tenantId)}
        ${hiddenInput('project_id', scope.projectId)}
        ${hiddenInput('return_to', returnTo)}
        <div class="field">
          <label class="field-label">Thread Title</label>
          <input name="title" value="console thread">
        </div>
        <button type="submit">Create Thread</button>
      </form>
    `, 'create-thread');
  }
  return renderActionCard('New Exploration', 'Create a browser exploration with explicit start URL and instruction.', `
    <form method="post" action="/actions/explorations/create" class="form-grid">
      ${hiddenInput('tenant_id', scope.tenantId)}
      ${hiddenInput('project_id', scope.projectId)}
      ${hiddenInput('return_to', returnTo)}
      <div class="field">
        <label class="field-label">Exploration Name</label>
        <input name="name" value="console exploration">
      </div>
      <div class="form-row">
        <div class="field">
          <label class="field-label">Thread ID</label>
          <input name="thread_id" placeholder="Optional thread id">
        </div>
        <div class="field">
          <label class="field-label">Start URL</label>
          <input name="start_url" value="https://example.com">
        </div>
      </div>
      <div class="field">
        <label class="field-label">Instruction</label>
        <textarea name="instruction">Explore the target flow and capture a recording.</textarea>
      </div>
      <button type="submit">Create Exploration</button>
    </form>
  `, 'create-exploration');
};

const renderThreadList = (pathname: string, params: URLSearchParams, listResult: PageResult<ThreadListItem>, selectedId: string | null): string => {
  const items = listResult.items.map((item) => {
    const next = new URLSearchParams(params);
    next.set('thread_id', item.id);
    return `
      <a class="list-item${item.id === selectedId ? ' selected' : ''}" href="${escapeHtml(`${pathname}?${next.toString()}`)}">
        <div class="list-item-head">
          <div class="list-item-title">${escapeHtml(displayThreadTitle(item))}</div>
        </div>
        <div class="list-item-subtitle">${item.messageCount} messages · ${item.factCount} memory facts</div>
        <div class="list-item-foot">
          <span class="meta">Updated ${escapeHtml(formatDateTime(item.updatedAt))}</span>
          ${renderSecondaryId(item.id)}
        </div>
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
        <div class="list-item-head">
          <div class="list-item-title">${escapeHtml(displayExplorationName(item))}</div>
          <div class="summary-badges">${renderStatus(item.status)}${item.recordingId ? '<span class="badge info">recording linked</span>' : ''}</div>
        </div>
        <div class="list-item-subtitle">${escapeHtml(formatUrlLabel(item.startUrl))}</div>
        <div class="list-item-foot">
          <span class="meta">Updated ${escapeHtml(formatDateTime(item.updatedAt))}</span>
          ${renderSecondaryId(item.id)}
        </div>
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
        <h2>${escapeHtml(displayThreadTitle(detail))}</h2>
        <div class="summary-badges"><span class="badge info">thread</span></div>
      </div>
      <div class="summary-grid three">
        ${renderField('Messages', String(detail.messages.length))}
        ${renderField('Memory Facts', String(detail.facts.length))}
        ${renderField('Linked Explorations', String(detail.explorations.length))}
        ${renderField('Created', escapeHtml(formatDateTime(detail.createdAt)))}
        ${renderField('Updated', escapeHtml(formatDateTime(detail.updatedAt)))}
        ${renderField('Thread ID', escapeHtml(shortId(detail.id)))}
      </div>
      <div class="list-item-foot">${renderSecondaryId(detail.id)}</div>
    </div>
    <div class="section">
      <div class="section-head"><h3>Messages</h3></div>
      ${detail.messages.length ? detail.messages.map((message) => `<div class="list-item"><div class="list-item-head"><div class="list-item-title">${escapeHtml(message.role)}</div><div class="summary-badges">${renderStatus(message.role)}</div></div><div class="list-item-subtitle">${escapeHtml(message.content)}</div><div class="list-item-foot"><span class="meta">${escapeHtml(formatDateTime(message.createdAt))}</span><span class="meta mono">ID ${escapeHtml(shortId(message.id))}</span></div></div>`).join('') : '<div class="empty">No messages yet.</div>'}
    </div>
    <div class="section">
      <div class="section-head"><h3>Memory Facts</h3></div>
      ${detail.facts.length ? detail.facts.map((fact) => `<div class="list-item"><div class="list-item-title">${escapeHtml(fact.content)}</div><div class="list-item-foot"><span class="meta">confidence ${fact.confidence.toFixed(2)}</span><span class="meta">${escapeHtml(formatDateTime(fact.createdAt))}</span></div></div>`).join('') : '<div class="empty">No memory facts yet.</div>'}
    </div>
    <div class="section">
      <div class="section-head"><h3>Linked Explorations</h3></div>
      ${detail.explorations.length ? detail.explorations.map((exploration) => `<a class="list-item" href="${escapeHtml(renderPageLink('/ai-workspace', scope, { workspace_view: 'explorations', exploration_id: exploration.id }))}"><div class="list-item-head"><div class="list-item-title">${escapeHtml(exploration.name ?? `Exploration ${shortId(exploration.id)}`)}</div><div class="summary-badges">${renderStatus(exploration.status)}</div></div><div class="list-item-foot"><span class="meta">Updated ${escapeHtml(formatDateTime(exploration.updatedAt))}</span>${renderSecondaryId(exploration.id)}</div></a>`).join('') : '<div class="empty">No linked explorations yet.</div>'}
    </div>
    <div class="section">
      <div class="section-head"><h3>Actions</h3></div>
      <div class="action-grid">
        ${renderActionCard('Send Message', 'Continue this thread with a new assistant request.', `
          <form method="post" action="/actions/threads/send" class="form-grid">
            ${hiddenInput('tenant_id', scope.tenantId)}
            ${hiddenInput('project_id', scope.projectId)}
            ${hiddenInput('thread_id', detail.id)}
            ${hiddenInput('return_to', returnTo)}
            <div class="field">
              <label class="field-label">Message</label>
              <textarea name="content">请总结一下当前线程已持有的事实。</textarea>
            </div>
            <button type="submit">Send Message</button>
          </form>
        `)}
        ${renderActionCard('Edit Title', 'Rename the thread so it is easier to scan in the list.', `
          <form method="post" action="/actions/threads/update" class="form-grid">
            ${hiddenInput('tenant_id', scope.tenantId)}
            ${hiddenInput('project_id', scope.projectId)}
            ${hiddenInput('thread_id', detail.id)}
            ${hiddenInput('return_to', returnTo)}
            <div class="field">
              <label class="field-label">Thread Title</label>
              <input name="title" value="${escapeHtml(detail.title ?? '')}">
            </div>
            <button type="submit">Save Title</button>
          </form>
        `)}
      </div>
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
        <h2>${escapeHtml(displayExplorationName(detail))}</h2>
        <div class="summary-badges">${renderStatus(detail.status)}${detail.recordingId ? '<span class="badge info">recording linked</span>' : ''}</div>
      </div>
      <div class="summary-grid three">
        ${renderField('Start URL', escapeHtml(formatUrlLabel(detail.startUrl)))}
        ${renderField('Execution Mode', escapeHtml(detail.executionMode))}
        ${renderField('Thread', escapeHtml(detail.threadId ? shortId(detail.threadId) : '—'))}
        ${renderField('Recording', escapeHtml(detail.recordingId ? shortId(detail.recordingId) : '—'))}
        ${renderField('Created', escapeHtml(formatDateTime(detail.createdAt)))}
        ${renderField('Updated', escapeHtml(formatDateTime(detail.updatedAt)))}
      </div>
      <div class="summary-grid">
        ${renderField('Created Case', escapeHtml(detail.createdTestCaseId ? shortId(detail.createdTestCaseId) : '—'))}
        ${renderField('Created Version', escapeHtml(detail.createdTestCaseVersionId ? shortId(detail.createdTestCaseVersionId) : '—'))}
      </div>
      <div class="stack">
        <div class="summary-item">
          <div class="field-label">Instruction</div>
          <div class="summary-value">${escapeHtml(truncateText(detail.instruction, 220))}</div>
        </div>
        <div class="summary-item">
          <div class="field-label">Summary</div>
          <div class="summary-value">${escapeHtml(detail.summary ? truncateText(detail.summary, 220) : 'No summary yet')}</div>
        </div>
      </div>
      <div class="list-item-foot">${renderSecondaryId(detail.id)}</div>
    </div>
    <div class="section">
      <div class="section-head"><h3>Artifacts</h3></div>
      ${detail.artifacts.length ? `<table><thead><tr><th>Kind</th><th>Path</th><th>Size</th></tr></thead><tbody>${detail.artifacts.map((artifact) => `<tr><td>${escapeHtml(artifact.kind)}</td><td class="mono">${escapeHtml(artifact.path)}</td><td>${escapeHtml(artifact.sizeBytes === null ? '—' : formatBytes(artifact.sizeBytes))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No exploration artifacts yet.</div>'}
    </div>
    <div class="section">
      <div class="section-head"><h3>Linked Data</h3></div>
      <div class="summary-grid">
        ${renderField('Created Test Case', detail.createdTestCaseId ? `<a href="${escapeHtml(renderPageLink('/assets', scope, { asset_type: 'test-cases', asset_id: detail.createdTestCaseId }))}">${escapeHtml(shortId(detail.createdTestCaseId))}</a>` : '—')}
        ${renderField('Created Version', escapeHtml(detail.createdTestCaseVersionId ? shortId(detail.createdTestCaseVersionId) : '—'))}
      </div>
      ${renderRawJson('Raw exploration payload', {
        instruction: detail.instruction,
        summary: detail.summary,
        lastSnapshotMarkdown: detail.lastSnapshotMarkdown,
        sampleDataset: detail.sampleDataset,
      })}
    </div>
    <div class="section">
      <div class="section-head"><h3>Actions</h3></div>
      <div class="action-grid">
        ${renderActionCard('Start or Stop', 'Control the execution state of this exploration.', `
          <div class="inline-actions">
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
          </div>
        `)}
        ${renderActionCard('Edit Name', 'Rename the exploration for better scanning and comparison.', `
          <form method="post" action="/actions/explorations/update" class="form-grid">
            ${hiddenInput('tenant_id', scope.tenantId)}
            ${hiddenInput('project_id', scope.projectId)}
            ${hiddenInput('exploration_id', detail.id)}
            ${hiddenInput('return_to', returnTo)}
            <div class="field">
              <label class="field-label">Exploration Name</label>
              <input name="name" value="${escapeHtml(detail.name ?? '')}">
            </div>
            <button type="submit">Save Name</button>
          </form>
        `)}
        ${renderActionCard('Publish as Test Case', 'Create or update a test case from the latest exploration result.', `
          <form method="post" action="/actions/explorations/publish" class="form-grid">
            ${hiddenInput('tenant_id', scope.tenantId)}
            ${hiddenInput('project_id', scope.projectId)}
            ${hiddenInput('exploration_id', detail.id)}
            ${hiddenInput('return_to', returnTo)}
            <div class="field">
              <label class="field-label">Case Name</label>
              <input name="name" value="${escapeHtml(detail.name ?? 'exploration-case')}">
            </div>
            <div class="form-row">
              <div class="field">
                <label class="field-label">Version Label</label>
                <input name="version_label" value="exploration-v1">
              </div>
              <div class="field">
                <label class="field-label">Change Summary</label>
                <input name="change_summary" value="published from console exploration">
              </div>
            </div>
            <label class="meta"><input type="checkbox" name="publish" value="true" checked> Publish immediately</label>
            <button type="submit">Publish Test Case</button>
          </form>
        `)}
      </div>
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
