import { importTestMedia } from '../helpers/import-media';
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { trim } from '../helpers/timeline';
test('generates and downloads a timestamped contact sheet from the edited sequence', async ({ page }) => {
  await page.goto('/'); await importTestMedia(page); await trim(page, 'end', 1);
  await page.getByLabel('Project tools', { exact: true }).click(); await page.getByRole('button', { name: 'Video contact sheet', exact: true }).click();
  await page.getByLabel('Contact sheet columns', { exact: true }).selectOption('2'); await page.getByLabel('Contact sheet rows', { exact: true }).selectOption('2'); await page.getByLabel('Contact sheet frame width', { exact: true }).selectOption('160');
  await page.getByRole('button', { name: 'Generate contact sheet', exact: true }).click(); await expect(page.getByRole('link', { name: 'Save contact sheet PNG', exact: true })).toBeVisible({ timeout: 45000 });
  const pending = page.waitForEvent('download'); await page.getByRole('link', { name: 'Save contact sheet PNG', exact: true }).click(); const bytes = await readFile((await (await pending).path())!);
  expect(bytes.readUInt32BE(16)).toBe(344); expect(bytes.readUInt32BE(20)).toBe(316);
  await page.getByLabel('Show sequence timestamps', { exact: true }).uncheck(); await expect(page.getByRole('link', { name: 'Save contact sheet PNG', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close contact sheet', exact: true }).click(); await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
});
