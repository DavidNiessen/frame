import { importTestMedia } from '../helpers/import-media';
import { closeEffect, openEffect, openCaptionTools } from '../helpers/effects';
import { trim } from '../helpers/timeline';
import { test, expect } from '@playwright/test';
test('imports, edits, previews and burns browser subtitles', async ({ page }) => {
  await page.goto('/'); await importTestMedia(page); await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click(); await trim(page, 'end', 1);
  await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click(); await openCaptionTools(page);
  await page.getByLabel('Import subtitle file').setInputFiles({ name: 'captions.vtt', mimeType: 'text/vtt', buffer: Buffer.from('WEBVTT\n\n00:00.000 --> 00:01.000\nHello browser') });
  await page.getByRole('button', { name: 'Caption 1', exact: true }).click();
  await expect(page.getByLabel('Caption text', { exact: true })).toHaveValue('Hello browser');
  await page.getByLabel('Caption text', { exact: true }).fill('Edited caption'); await expect(page.locator('.caption-preview')).toContainText('Edited caption');
  await closeEffect(page); await page.getByRole('button', { name: 'Export MP4', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Save file' })).toBeVisible({ timeout: 45000 });
});
