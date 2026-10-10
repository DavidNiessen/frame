import { expect, test } from '@playwright/test';
import { rm } from 'node:fs/promises';
import { conversionLibrary } from '../helpers/conversion-library';
test('shows original audio properties and metadata in both workflows while keeping information open during playback', async ({ page }) => {
  const library = await conversionLibrary();
  try {
    await page.goto('/'); await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeEnabled(); await page.getByLabel('Choose media files').setInputFiles(library.sources[0]);
    await page.getByRole('button', { name: 'Media information for Song.wav', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Source information', exact: true });
    await expect(dialog).toContainText('PCM_S16LE'); await expect(dialog).toContainText('44,100 Hz');
    await expect(dialog).toContainText('Portable Song'); await expect(dialog).toContainText('Frame Artist');
    await page.keyboard.press('Space'); await expect(page.locator('audio')).toHaveJSProperty('paused', false); await expect(dialog).toBeVisible();
    await page.keyboard.press('Space'); await expect(page.locator('audio')).toHaveJSProperty('paused', true);
    await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
    await page.getByRole('navigation', { name: 'Workflow' }).getByRole('button', { name: 'Convert', exact: true }).click();
    await page.getByRole('button', { name: 'Media information for Song.wav', exact: true }).click();
    await expect(dialog).toContainText('Mono (1)'); await page.getByRole('button', { name: 'Close source information' }).click();
    await expect(dialog).not.toBeVisible();
  } finally { await rm(library.directory, { recursive: true, force: true }); }
});
