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

export class PlaywrightBrowserLauncher implements BrowserLauncher {
  async launch(profile: BrowserProfile): Promise<Browser> {
    return getBrowserType(profile.browser).launch({ headless: profile.headless });
  }
}
