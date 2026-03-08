import assert from 'node:assert/strict';

import { chromium } from 'playwright';

await import(new URL('./run_ai_orchestrator_workflow_smoke.mjs', import.meta.url).href);

const consoleBaseUrl = process.env.CONSOLE_BASE_URL ?? 'http://console:8082';
const tenantId = 'tenant-ai-workflow';
const projectId = 'project-ai-workflow';
const scopeQuery = `tenant_id=${encodeURIComponent(tenantId)}&project_id=${encodeURIComponent(projectId)}`;

const assertOk = (condition, message) => {
  assert.equal(condition, true, message);
};

const getJson = async (baseUrl, pathname) => {
  const response = await fetch(new URL(pathname, baseUrl));
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const visited = [];

const visit = async (pathname) => {
  const url = `${consoleBaseUrl}${pathname}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  visited.push(pathname);
};

const visibleText = async (text) => page.getByText(text, { exact: false }).first().isVisible();

try {
  const health = await getJson(consoleBaseUrl, '/healthz');
  assertOk(health.status === 200, 'console healthz should succeed');

  await visit(`/overview?${scopeQuery}`);
  assertOk(await visibleText('Overview'), 'overview heading should render');
  assertOk(await visibleText('Evidence Summary'), 'overview evidence summary should render');

  await visit(`/assets?${scopeQuery}&asset_type=test-cases`);
  assertOk(await visibleText('Assets'), 'assets heading should render');
  assertOk(await visibleText('Structure and History'), 'test case detail should render');
  assertOk((await page.locator('.list .list-item').count()) >= 1, 'assets list should have at least one item');

  await page.selectOption('select[name="asset_type"]', 'recordings');
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.waitForLoadState('networkidle');
  assertOk(await visibleText('Recording Events'), 'recording detail should render after switching asset type');

  await visit(`/runs?${scopeQuery}`);
  assertOk(await visibleText('Runs'), 'runs heading should render');
  await page.selectOption('select[name="status"]', 'failed');
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.waitForLoadState('networkidle');
  assertOk(await visibleText('AI Diagnostics'), 'run diagnostics should render for filtered run list');

  await visit(`/ai-workspace?${scopeQuery}&workspace_view=threads`);
  assertOk(await visibleText('AI Workspace'), 'ai workspace heading should render');
  assertOk(await visibleText('Messages'), 'thread detail should render');
  await page.locator('details.action-panel summary').filter({ hasText: 'Edit Title' }).first().click();
  const titleInput = page.locator('form[action="/actions/threads/update"] input[name="title"]').first();
  const updatedThreadTitle = `console smoke thread ${Date.now()}`;
  await titleInput.fill(updatedThreadTitle);
  await page.locator('form[action="/actions/threads/update"] button[type="submit"]').first().click();
  await page.waitForLoadState('networkidle');
  assertOk(await visibleText('Thread title updated'), 'thread update flash should render');
  assertOk(await visibleText(updatedThreadTitle), 'updated thread title should render');

  await visit(`/ai-workspace?${scopeQuery}&workspace_view=explorations`);
  assertOk(await visibleText('Artifacts'), 'exploration detail should render');

  console.log(JSON.stringify({
    status: 'ok',
    consoleBaseUrl,
    tenantId,
    projectId,
    visited,
    updatedThreadTitle,
  }, null, 2));
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
}
