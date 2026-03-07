import type { Browser, BrowserContext, Page } from 'playwright-core';
import type { BrowserProfile } from '@aiwtp/web-dsl-schema';
import type { BrowserLauncher } from '../session/browser-launcher.js';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const createFakePage = (visitedUrls: string[], delayMs: number): Page => ({
  goto: async (url: string) => {
    if (delayMs > 0) {
      await sleep(delayMs);
    }
    visitedUrls.push(url);
    return null as never;
  },
  url: () => visitedUrls[visitedUrls.length - 1] ?? 'about:blank',
} as unknown as Page);

const createFakeContext = (visitedUrls: string[], delayMs: number): BrowserContext => ({
  newPage: async () => createFakePage(visitedUrls, delayMs),
  close: async () => {},
} as unknown as BrowserContext);

const createFakeBrowser = (visitedUrls: string[], delayMs: number): Browser => ({
  newContext: async () => createFakeContext(visitedUrls, delayMs),
  close: async () => {},
} as unknown as Browser);

export interface FakeBrowserLauncherOptions {
  delayMs?: number;
}

export class FakeBrowserLauncher implements BrowserLauncher {
  readonly visitedUrls: string[] = [];
  private readonly delayMs: number;

  constructor(options: FakeBrowserLauncherOptions = {}) {
    this.delayMs = options.delayMs ?? 0;
  }

  async launch(_profile: BrowserProfile): Promise<Browser> {
    return createFakeBrowser(this.visitedUrls, this.delayMs);
  }
}
