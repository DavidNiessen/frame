import { closeEffect, openEffect } from '../helpers/effects';
import { trim } from '../helpers/timeline';
import { test, expect } from '@playwright/test';
test('imports, edits, previews and burns browser subtitles', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample' }).click(); await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click(); await trim(page, 'end', 1);
  await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click(); await openEffect(page, 'Captions');
  await page.getByLabel('Import subtitle file').setInputFiles({ name: 'captions.vtt', mimeType: 'text/vtt', buffer: Buffer.from('WEBVTT\n\n00:00.000 --> 00:01.000\nHello browser') });
  await expect(page.getByLabel('Subtitle 1 text')).toHaveValue('Hello browser');
  await page.getByLabel('Subtitle 1 text').fill('Edited caption'); await expect(page.locator('.caption-preview')).toContainText('Edited caption');
  await closeEffect(page); await page.getByRole('button', { name: 'Export MP4', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Save file' })).toBeVisible({ timeout: 45000 });
});
