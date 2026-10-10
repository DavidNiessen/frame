import { expect, type ElectronApplication, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
/** Exercise the normal import path; test media is never bundled with Frame. */
export async function importTestMedia(page: Page, app?: ElectronApplication) {
  const status = page.getByLabel('Autosave status');
  if (await status.count()) await expect(status).not.toHaveText(/Reopening|Clearing/);
  const previous = await page.locator('.asset-list li').count();
  const path = resolve('tests/fixtures/sample.mp4');
  if (app) {
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, path);
    await page.getByRole('button', { name: 'Add media', exact: true }).click();
  } else {
    const choosing = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Add media', exact: true }).click();
    await (await choosing).setFiles({ name: 'Studio study.mp4', mimeType: 'video/mp4', buffer: await readFile(path) });
  }
  await expect(page.locator('.asset-list li')).toHaveCount(previous + 1);
  await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeEnabled();
}
