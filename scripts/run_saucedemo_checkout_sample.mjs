import { WebJobRunner, NoopResultPublisher, PlaywrightBrowserLauncher } from '../apps/web-worker/dist/index.js';
import { DefaultDslCompiler } from '../packages/dsl-compiler/dist/index.js';
import { RegistryBasedPlaywrightAdapter } from '../packages/playwright-adapter/dist/index.js';
import { pathToFileURL } from 'node:url';

const browserProfile = {
  browser: 'chromium',
  headless: true,
  viewport: { width: 1440, height: 900 },
};

export const createSauceDemoCheckoutJob = () => ({
  jobId: '11111111-1111-1111-1111-111111111111',
  tenantId: '22222222-2222-2222-2222-222222222222',
  projectId: '33333333-3333-3333-3333-333333333333',
  runId: '44444444-4444-4444-4444-444444444444',
  runItemId: '55555555-5555-5555-5555-555555555555',
  attemptNo: 1,
  traceId: 'trace-saucedemo-checkout-001',
  correlationId: 'corr-saucedemo-checkout-001',
  envProfile: {
    profileId: 'saucedemo-prod',
    browserProfile,
  },
  plan: {
    planId: 'saucedemo-checkout-plan',
    planName: 'SauceDemo 下单流程',
    version: 'v1',
    browserProfile,
    defaults: {
      timeoutMs: 15000,
      retryPolicy: { maxAttempts: 1, intervalMs: 0, backoff: 'fixed' },
      artifactPolicy: {
        screenshot: 'always',
        trace: 'always',
        video: 'none',
        domSnapshot: false,
        networkCapture: false,
      },
    },
    steps: [
      {
        stepId: 'open-login',
        name: '打开登录页',
        kind: 'navigation',
        action: 'open',
        input: { source: 'literal', value: 'https://www.saucedemo.com/' },
      },
      {
        stepId: 'fill-username',
        name: '输入用户名',
        kind: 'interaction',
        action: 'input',
        locator: { strategy: 'css', value: '#user-name' },
        input: { source: 'literal', value: 'standard_user' },
      },
      {
        stepId: 'fill-password',
        name: '输入密码',
        kind: 'interaction',
        action: 'input',
        locator: { strategy: 'css', value: '#password' },
        input: { source: 'literal', value: 'secret_sauce' },
      },
      {
        stepId: 'click-login',
        name: '点击登录',
        kind: 'interaction',
        action: 'click',
        locator: { strategy: 'css', value: '#login-button' },
      },
      {
        stepId: 'wait-title',
        name: '等待商品标题出现',
        kind: 'interaction',
        action: 'wait',
        locator: { strategy: 'css', value: '.title' },
        timeoutMs: 15000,
      },
      {
        stepId: 'assert-inventory-page',
        name: '断言进入商品页',
        kind: 'assertion',
        action: 'assert',
        assertions: [
          { operator: 'url_contains', expected: '/inventory.html' },
          { operator: 'text_contains', expected: 'Products', locator: { strategy: 'css', value: '.title' } },
        ],
      },
      {
        stepId: 'add-backpack',
        name: '加入背包',
        kind: 'interaction',
        action: 'click',
        locator: { strategy: 'css', value: '#add-to-cart-sauce-labs-backpack' },
      },
      {
        stepId: 'add-bolt-shirt',
        name: '加入短袖',
        kind: 'interaction',
        action: 'click',
        locator: { strategy: 'css', value: '#add-to-cart-sauce-labs-bolt-t-shirt' },
      },
      {
        stepId: 'add-bike-light',
        name: '加入自行车灯',
        kind: 'interaction',
        action: 'click',
        locator: { strategy: 'css', value: '#add-to-cart-sauce-labs-bike-light' },
      },
      {
        stepId: 'add-fleece-jacket',
        name: '加入外套',
        kind: 'interaction',
        action: 'click',
        locator: { strategy: 'css', value: '#add-to-cart-sauce-labs-fleece-jacket' },
      },
      {
        stepId: 'assert-cart-badge',
        name: '断言购物车数量',
        kind: 'assertion',
        action: 'assert',
        assertions: [
          { operator: 'text_contains', expected: '4', locator: { strategy: 'css', value: '.shopping_cart_badge' } },
        ],
      },
      {
        stepId: 'open-cart',
        name: '打开购物车',
        kind: 'interaction',
        action: 'click',
        locator: { strategy: 'css', value: '.shopping_cart_link' },
      },
      {
        stepId: 'click-checkout',
        name: '点击结账',
        kind: 'interaction',
        action: 'click',
        locator: { strategy: 'css', value: '#checkout' },
      },
      {
        stepId: 'wait-checkout-step-one',
        name: '等待结账第一页',
        kind: 'interaction',
        action: 'wait',
        locator: { strategy: 'css', value: '#first-name' },
        timeoutMs: 15000,
      },
      {
        stepId: 'assert-checkout-step-one',
        name: '断言结账第一页URL',
        kind: 'assertion',
        action: 'assert',
        assertions: [
          { operator: 'url_contains', expected: '/checkout-step-one.html' },
        ],
      },
      {
        stepId: 'fill-first-name',
        name: '输入名字',
        kind: 'interaction',
        action: 'input',
        locator: { strategy: 'css', value: '#first-name' },
        input: { source: 'literal', value: '姓名12345' },
      },
      {
        stepId: 'fill-last-name',
        name: '输入姓氏',
        kind: 'interaction',
        action: 'input',
        locator: { strategy: 'css', value: '#last-name' },
        input: { source: 'literal', value: '姓名67890' },
      },
      {
        stepId: 'fill-postal-code',
        name: '输入邮编',
        kind: 'interaction',
        action: 'input',
        locator: { strategy: 'css', value: '#postal-code' },
        input: { source: 'literal', value: '987654' },
      },
      {
        stepId: 'click-continue',
        name: '继续结账',
        kind: 'interaction',
        action: 'click',
        locator: { strategy: 'css', value: '#continue' },
      },
      {
        stepId: 'wait-checkout-step-two',
        name: '等待结账第二页',
        kind: 'interaction',
        action: 'wait',
        locator: { strategy: 'css', value: '#finish' },
        timeoutMs: 15000,
      },
      {
        stepId: 'assert-checkout-step-two',
        name: '断言结账第二页URL',
        kind: 'assertion',
        action: 'assert',
        assertions: [
          { operator: 'url_contains', expected: '/checkout-step-two.html' },
        ],
      },
      {
        stepId: 'click-finish',
        name: '完成下单',
        kind: 'interaction',
        action: 'click',
        locator: { strategy: 'css', value: '#finish' },
      },
      {
        stepId: 'wait-complete',
        name: '等待完成页',
        kind: 'interaction',
        action: 'wait',
        locator: { strategy: 'css', value: '.complete-header' },
        timeoutMs: 15000,
      },
      {
        stepId: 'assert-complete',
        name: '断言完成页',
        kind: 'assertion',
        action: 'assert',
        assertions: [
          { operator: 'url_contains', expected: '/checkout-complete.html' },
          { operator: 'text_contains', expected: 'Thank you for your order!', locator: { strategy: 'css', value: '.complete-header' } },
        ],
      },
      {
        stepId: 'back-to-products',
        name: '返回商品页',
        kind: 'interaction',
        action: 'click',
        locator: { strategy: 'css', value: '#back-to-products' },
      },
      {
        stepId: 'wait-inventory-return',
        name: '等待返回商品页标题',
        kind: 'interaction',
        action: 'wait',
        locator: { strategy: 'css', value: '.title' },
        timeoutMs: 15000,
      },
      {
        stepId: 'assert-back-on-inventory',
        name: '断言回到商品页',
        kind: 'assertion',
        action: 'assert',
        assertions: [
          { operator: 'url_contains', expected: '/inventory.html' },
        ],
      },
    ],
  },
});

const main = async () => {
  const publisher = new NoopResultPublisher();
  const runner = new WebJobRunner(
    new DefaultDslCompiler(),
    new RegistryBasedPlaywrightAdapter(),
    publisher,
    new PlaywrightBrowserLauncher(),
  );

  const result = await runner.run(createSauceDemoCheckoutJob());
  const failedStep = result.planResult?.stepResults.find((step) => step.status !== 'passed');
  const stepArtifacts = (result.planResult?.stepResults ?? []).flatMap((step) =>
    step.artifacts.map((artifact) => ({
      stepId: step.sourceStepId,
      kind: artifact.kind,
      uri: artifact.uri,
    })),
  );

  console.log(JSON.stringify({
    workerStatus: result.status,
    issueCount: result.issues.length,
    planStatus: result.planResult?.status ?? null,
    stepCount: result.planResult?.stepResults.length ?? 0,
    stepArtifactCount: stepArtifacts.length,
    failedStep: failedStep ? {
      sourceStepId: failedStep.sourceStepId,
      status: failedStep.status,
      errorCode: failedStep.errorCode,
      errorMessage: failedStep.errorMessage,
    } : null,
    planArtifacts: result.planResult?.artifacts.map((artifact) => ({ kind: artifact.kind, uri: artifact.uri })) ?? [],
    stepArtifacts: stepArtifacts.slice(0, 12),
  }, null, 2));
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
