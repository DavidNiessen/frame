import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test('exports a batch with shared output settings and individual downloads', async ({ page }, testInfo) => {
  await page.goto('/'); const buffer = await readFile('public/sample.mp4');
  await page.getByLabel('Choose media files').setInputFiles(['one.mp4', 'two.mp4'].map(name => ({ name, mimeType: 'video/mp4', buffer })));
  await page.getByLabel('Output format').selectOption('flac');
  await page.getByLabel('Project tools', { exact: true }).click(); await page.getByRole('button', { name: 'Batch export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Batch export', exact: true });
  await dialog.getByLabel('Batch settings').selectOption('output');
  await dialog.getByRole('button', { name: 'Start batch export' }).click();
  await expect(dialog.getByRole('link')).toHaveCount(2, { timeout: 45000 });
  for (const link of await dialog.getByRole('link').all()) {
    const pending = page.waitForEvent('download'); await link.click(); const download = await pending;
    await download.saveAs(testInfo.outputPath(download.suggestedFilename()));
    expect(download.suggestedFilename()).toMatch(/\.flac$/);
  }
  await dialog.getByRole('button', { name: 'Clear queue' }).click();
  await expect(dialog.getByRole('link')).toHaveCount(0);
});
