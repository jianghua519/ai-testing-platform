import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Browser, BrowserContext, Page, Video } from 'playwright-core';
import type { BrowserProfile } from '@aiwtp/web-dsl-schema';
import type { BrowserLauncher } from '../session/browser-launcher.js';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const createFakeVideo = (): Video => ({
  path: async () => '/tmp/fake-video.webm',
  saveAs: async (targetPath: string) => {
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, 'fake-video', 'utf8');
  },
  delete: async () => {},
} as unknown as Video);

const createFakePage = (visitedUrls: string[], delayMs: number): Page => ({
  goto: async (url: string) => {
    if (delayMs > 0) {
      await sleep(delayMs);
    }
    visitedUrls.push(url);
    return null as never;
  },
  screenshot: async (options?: { path?: string }) => {
    if (options?.path) {
      await mkdir(path.dirname(options.path), { recursive: true });
      await writeFile(options.path, 'fake-screenshot', 'utf8');
    }
    return Buffer.from('fake-screenshot');
  },
  video: () => createFakeVideo(),
  url: () => visitedUrls[visitedUrls.length - 1] ?? 'about:blank',
} as unknown as Page);

const createFakeContext = (visitedUrls: string[], delayMs: number): BrowserContext => ({
  newPage: async () => createFakePage(visitedUrls, delayMs),
  tracing: {
    start: async () => {},
    startChunk: async () => {},
    stopChunk: async (options?: { path?: string }) => {
      if (options?.path) {
        await mkdir(path.dirname(options.path), { recursive: true });
        await writeFile(options.path, 'fake-trace', 'utf8');
      }
    },
    stop: async () => {},
  },
  pages: () => [],
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
