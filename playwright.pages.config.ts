import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/pages',
  outputDir: 'test-results/pages',
  timeout: 90000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5178',
    channel: 'chromium',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
  webServer: { command: 'node tests/helpers/serve-pages.mjs', url: 'http://127.0.0.1:5178/frame/' },
});
