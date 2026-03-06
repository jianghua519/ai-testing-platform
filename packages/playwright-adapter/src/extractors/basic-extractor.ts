import type { CompiledStep, ExtractedVariable } from '@aiwtp/web-dsl-schema';
import type { Page } from 'playwright-core';
import { buildLocator } from '../locators/locator-factory.js';

export const extractForStep = async (page: Page, step: CompiledStep): Promise<ExtractedVariable[]> => {
  if (step.action !== 'extract') {
    return [];
  }

  let value: unknown;
  if (step.locatorResolved) {
    value = await buildLocator(page, step.locatorResolved).textContent();
  } else {
    value = page.url();
  }

  return [
    {
      name: step.sourceStepId,
      value,
    },
  ];
};
