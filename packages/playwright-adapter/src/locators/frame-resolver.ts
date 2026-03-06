import type { Page } from 'playwright-core';

export const resolveFrameTarget = (page: Page, framePath: string[]): Page | import('playwright-core').FrameLocator => {
  return framePath.reduce<import('playwright-core').Page | import('playwright-core').FrameLocator>(
    (current, entry) => current.frameLocator(entry),
    page,
  );
};
