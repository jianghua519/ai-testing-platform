import type { Browser, BrowserType } from 'playwright-core';
import { chromium, firefox, webkit } from 'playwright-core';
import type { BrowserKind, BrowserProfile } from '@aiwtp/web-dsl-schema';

export interface BrowserLauncher {
  launch(profile: BrowserProfile): Promise<Browser>;
}

const getBrowserType = (browser: BrowserKind): BrowserType<Browser> => {
  switch (browser) {
    case 'chromium':
      return chromium;
    case 'firefox':
      return firefox;
    case 'webkit':
      return webkit;
  }
};

const getLaunchArgs = (browser: BrowserKind): string[] | undefined => {
  if (browser !== 'chromium') {
    return undefined;
  }

  const args = ['--disable-dev-shm-usage'];
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    args.push('--no-sandbox');
  }

  return args;
};

export class PlaywrightBrowserLauncher implements BrowserLauncher {
  async launch(profile: BrowserProfile): Promise<Browser> {
    return getBrowserType(profile.browser).launch({
      headless: profile.headless,
      args: getLaunchArgs(profile.browser),
    });
  }
}
