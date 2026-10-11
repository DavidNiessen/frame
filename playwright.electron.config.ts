import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/electron',
  outputDir: 'test-results/desktop',
  timeout: 45000,
  expect: { timeout: 15000 },
  workers: 1,
  use: { trace: 'retain-on-failure' },
});
