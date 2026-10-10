import { importTestMedia } from '../helpers/import-media';
import { trim } from '../helpers/timeline';
import { test, expect } from '@playwright/test';
test('calculates browser target-size bitrates and exports', async ({ page }) => {
  await page.goto('/'); await importTestMedia(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click(); await trim(page, 'end', 1);
  await page.getByRole('tab', { name: 'Export', exact: true }).click(); await page.getByLabel('Target size mode').check(); await page.getByLabel('Target size MB').fill('0.1');
  await expect(page.getByLabel('Estimated export size')).toContainText('568 kbps video');
  await page.getByRole('button', { name: 'Export MP4', exact: true }).click(); await expect(page.getByRole('link', { name: 'Save file' })).toBeVisible({ timeout: 45000 });
});
