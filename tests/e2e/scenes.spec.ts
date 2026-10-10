import { expect, test } from '@playwright/test';
import { rm } from 'node:fs/promises';
import { sceneFixture } from '../helpers/scenes';
test('detects source scene changes, adds markers and splits the timeline with undo', async ({ page }) => {
  const fixture = await sceneFixture();
  try {
    await page.goto('/'); await page.getByLabel('Choose media files').setInputFiles(fixture.source); await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
    async function detect() { await page.getByText('Project tools', { exact: true }).click(); await page.getByRole('button', { name: 'Find scene changes', exact: true }).click(); await page.getByLabel('Scene change threshold', { exact: true }).fill('0.1'); await page.getByRole('button', { name: 'Detect scene changes', exact: true }).click(); await expect(page.getByRole('dialog', { name: 'Find scene changes' })).toContainText('2 changes · 2 selected', { timeout: 45000 }); }
    await detect(); await page.getByRole('button', { name: 'Add scene markers', exact: true }).click(); await expect(page.getByRole('button', { name: 'Marker: Scene 1', exact: true })).toBeVisible();
    await detect(); await page.getByRole('button', { name: 'Split at selected changes', exact: true }).click(); await expect(page.locator('.timeline-clip')).toHaveCount(3);
    await page.getByRole('button', { name: 'Undo edit', exact: true }).click(); await expect(page.locator('.timeline-clip')).toHaveCount(1); await expect(page.getByRole('button', { name: 'Marker: Scene 2', exact: true })).toBeVisible();
  } finally { await rm(fixture.directory, { recursive: true, force: true }); }
});
