import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/electron', outputDir: 'test-results/desktop', timeout: 45000, workers: 1 });
