import type { ResolvedLocator } from '@aiwtp/web-dsl-schema';
import type { Locator, Page } from 'playwright-core';
import { resolveFrameTarget } from './frame-resolver.js';

export const buildLocator = (page: Page, locator: ResolvedLocator): Locator => {
  const target = resolveFrameTarget(page, locator.framePath);
  switch (locator.strategy) {
    case 'role':
      return target.getByRole((locator.value as Parameters<Page['getByRole']>[0]), {
        name: locator.value,
        exact: true,
      });
    case 'text':
      return target.getByText(locator.value, { exact: true });
    case 'label':
      return target.getByLabel(locator.value, { exact: true });
    case 'placeholder':
      return target.getByPlaceholder(locator.value, { exact: true });
    case 'test_id':
      return target.getByTestId(locator.value);
    case 'css':
      return target.locator(locator.value);
    case 'xpath':
      return target.locator(`xpath=${locator.value}`);
  }
};
