import { trim } from '../helpers/timeline';
import { test, expect } from '@playwright/test';
test('exports browser text and an image watermark', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample' }).click(); await page.getByRole('tab', { name: 'Edit', exact: true }).click(); await trim(page, 'end', 1);
  await page.getByRole('tab', { name: 'Effects', exact: true }).click(); await page.getByText('Text & watermark', { exact: true }).click(); await page.getByLabel('Overlay text', { exact: true }).fill('Frame watermark');
  const image = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 64; c.getContext('2d')!.fillRect(0, 0, 64, 64); return c.toDataURL().split(',')[1]; });
  await page.getByLabel('Watermark image file').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
  await expect(page.getByAltText('Watermark preview')).toBeVisible(); await expect(page.locator('.overlay-preview')).toContainText('Frame watermark');
  await page.getByRole('button', { name: 'Export MP4', exact: true }).click(); await expect(page.getByRole('link', { name: 'Save file' })).toBeVisible({ timeout: 45000 });
});
