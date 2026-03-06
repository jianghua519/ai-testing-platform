import type { CompiledAssertion } from '@aiwtp/web-dsl-schema';
import type { Page } from 'playwright-core';
import { buildLocator } from '../locators/locator-factory.js';

const assertCondition = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

export const runAssertions = async (page: Page, assertions: CompiledAssertion[], timeoutMs: number): Promise<void> => {
  for (const assertion of assertions) {
    if (assertion.operator === 'url_contains') {
      assertCondition(page.url().includes(assertion.expected ?? ''), `url does not contain ${assertion.expected}`);
      continue;
    }

    if (!assertion.locator) {
      throw new Error(`assertion ${assertion.operator} requires locator`);
    }

    const locator = buildLocator(page, assertion.locator);
    await locator.waitFor({ timeout: timeoutMs });

    switch (assertion.operator) {
      case 'visible':
        assertCondition(await locator.isVisible(), 'locator is not visible');
        break;
      case 'hidden':
        assertCondition(await locator.isHidden(), 'locator is not hidden');
        break;
      case 'text_equals':
        assertCondition((await locator.textContent())?.trim() === (assertion.expected ?? ''), 'locator text mismatch');
        break;
      case 'text_contains':
        assertCondition((await locator.textContent())?.includes(assertion.expected ?? '') ?? false, 'locator text does not contain expected');
        break;
      case 'value_equals':
        assertCondition((await locator.inputValue()) === (assertion.expected ?? ''), 'locator value mismatch');
        break;
      case 'attr_equals':
        assertCondition((await locator.getAttribute(assertion.attrName ?? '')) === (assertion.expected ?? ''), 'locator attribute mismatch');
        break;
    }
  }
};
