import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { importTestMedia } from '../helpers/import-media';
test('isolates a Pages subdirectory without host headers and converts media locally', async ({
  page,
}) => {
  const response = await page.goto('/frame/');
  expect(response!.headers()['cross-origin-embedder-policy']).toBeUndefined();
  // Locator assertions survive the service worker's first controlled navigation.
  await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await importTestMedia(page);
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  await page.getByRole('tab', { name: 'Export', exact: true }).click();
  await page.getByLabel('Output format').selectOption('flac');
  await page.getByRole('button', { name: 'Export FLAC', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Save file', exact: true })).toBeVisible({
    timeout: 45000,
  });
  await page.getByLabel('Output format').selectOption('gif');
  await page.getByRole('button', { name: 'Export GIF', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Save file', exact: true })).toBeVisible({
    timeout: 45000,
  });
  const pending = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Save file', exact: true }).click();
  const gif = await readFile((await (await pending).path())!);
  expect(gif.toString('ascii', 0, 6)).toMatch(/^GIF8[79]a$/);
  expect(gif.readUInt16LE(6)).toBe(640);
  await expect(page.getByLabel('Autosave status')).toHaveText('Workspace autosaved');
  await page.reload();
  await expect.poll(() => page.evaluate(() => crossOriginIsolated)).toBe(true);
  await expect(page.locator('.asset-list li')).toHaveCount(1, { timeout: 30000 });
});
