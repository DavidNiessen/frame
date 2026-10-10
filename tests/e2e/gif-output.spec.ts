import { importTestMedia } from '../helpers/import-media';
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { trim } from '../helpers/timeline';
test('exports a compact GIF with explicit repeats and exposes the same conversion options', async ({ page }) => {
  await page.goto('/'); await importTestMedia(page); await trim(page, 'end', .5);
  await page.getByLabel('Output format', { exact: true }).selectOption('gif');
  await page.getByRole('tab', { name: 'Export', exact: true }).click(); await page.getByText('Advanced settings', { exact: true }).click();
  await page.getByLabel('GIF frame rate', { exact: true }).fill('4');
  await page.getByLabel('GIF repeat mode', { exact: true }).selectOption('count'); await page.getByLabel('GIF extra repeats', { exact: true }).fill('3');
  await page.getByLabel('GIF width', { exact: true }).selectOption('320'); await page.getByLabel('GIF palette colors', { exact: true }).selectOption('64'); await page.getByLabel('GIF dithering', { exact: true }).selectOption('bayer');
  await page.getByRole('button', { name: 'Export GIF', exact: true }).click(); await expect(page.getByRole('link', { name: 'Save file', exact: true })).toBeVisible({ timeout: 45000 });
  const pending = page.waitForEvent('download'); await page.getByRole('link', { name: 'Save file', exact: true }).click();
  const bytes = await readFile((await (await pending).path())!); expect(bytes.readUInt16LE(6)).toBe(320); expect(bytes.readUInt16LE(bytes.indexOf('NETSCAPE2.0') + 13)).toBe(3);
  await page.getByRole('navigation', { name: 'Workflow' }).getByRole('button', { name: 'Convert', exact: true }).click();
  await page.getByLabel('Conversion format', { exact: true }).selectOption('gif'); await page.getByText('Advanced options', { exact: true }).click();
  await page.getByLabel('GIF repeat mode', { exact: true }).selectOption('once'); await expect(page.getByLabel('GIF extra repeats', { exact: true })).toHaveCount(0);
  await page.getByLabel('GIF dithering', { exact: true }).selectOption('none');
});
