import { test, expect } from '@playwright/test';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { conversionLibrary, probeConversion } from '../helpers/conversion-library';

test('converts nested song folders and downloads a ZIP with complete media and metadata', async ({ page }, testInfo) => {
  const library = await conversionLibrary();
  try {
    await page.goto('/');
    const workflow = page.getByRole('navigation', { name: 'Workflow' });
    await workflow.getByRole('button', { name: 'Convert', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Add folder', exact: true })).toBeEnabled();
    await page.getByLabel('Choose media folder').setInputFiles(library.root);
    await expect(page.getByRole('heading', { name: 'Files to convert' })).toBeVisible({ timeout: 45000 });
    await expect(page.locator('.conversion-table tbody tr')).toHaveCount(2);
    await expect(page.locator('.conversion-import-report')).toContainText('1 file could not be read');
    await expect(page.locator('audio, video, .timeline-track')).toHaveCount(0);
    await page.getByLabel('Conversion format').selectOption('mp4');
    await expect(page.getByRole('button', { name: 'Convert 2 files', exact: true })).toBeDisabled();
    await expect(page.locator('.conversion-error')).toContainText('incompatible');
    await page.getByLabel('Conversion format').selectOption('flac');
    await page.getByText('Advanced options', { exact: true }).click();
    await expect(page.getByRole('switch', { name: 'Conversion include artwork' })).toBeChecked();
    await expect(page.getByRole('switch', { name: 'Conversion keep metadata' })).toBeChecked();
    await expect(page.getByLabel('Keep folder structure')).toBeChecked();
    await page.getByLabel('Search conversion files').fill('Album One');
    await expect(page.locator('.conversion-table tbody tr')).toHaveCount(1);
    await page.getByLabel('Search conversion files').clear();
    await page.getByLabel('Convert Album One/Song.wav', { exact: true }).uncheck();
    await expect(page.getByRole('button', { name: 'Convert 1 file', exact: true })).toBeEnabled();
    await page.getByLabel('Convert Album One/Song.wav', { exact: true }).check();
    await page.getByRole('button', { name: 'Convert 2 files', exact: true }).click();
    await expect(page.getByText('Converted', { exact: true })).toHaveCount(2, { timeout: 45000 });
    await expect(page.getByRole('link', { name: /^Download Album / })).toHaveCount(2);
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download all (ZIP)' }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe('converted-media.zip');
    const archive = unzipSync(await readFile((await download.path())!));
    expect(Object.keys(archive).sort()).toEqual(['Album One/Song.flac', 'Album Two/Song.flac']);
    for (const [index, data] of Object.values(archive).entries()) {
      const path = testInfo.outputPath(`converted-${index}.flac`); await writeFile(path, data);
      const info = await probeConversion(path);
      expect(info.streams[0].codec_name).toBe('flac');
      expect(Number(info.format.duration)).toBeCloseTo(2, 2);
      expect(info.format.tags.artist).toBe('Frame Artist');
      expect(info.format.tags.title).toBe('Portable Song');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByLabel('Conversion format')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.getByRole('button', { name: 'Clear results', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Convert 2 files', exact: true })).toBeEnabled();
    await workflow.getByRole('button', { name: 'Editor', exact: true }).click();
    await expect(page.getByRole('img', { name: 'Audio waveform', exact: true })).toBeVisible({ timeout: 45000 });
    await expect(page.getByLabel('Trim start', { exact: true })).toHaveAttribute('aria-valuenow', '0');
    await expect(page.getByLabel('Trim end', { exact: true })).toHaveAttribute('aria-valuenow', '2');
  } finally { await rm(library.directory, { recursive: true, force: true }); }
});

test('remembers the conversion workflow and leaves editor drafts unchanged', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose media files').setInputFiles({ name: 'study.mp4', mimeType: 'video/mp4', buffer: await readFile('tests/fixtures/sample.mp4') });
  await expect(page.getByLabel('Trim start', { exact: true })).toBeVisible();
  await page.getByLabel('Trim start', { exact: true }).press('ArrowRight');
  const start = await page.getByLabel('Trim start', { exact: true }).getAttribute('aria-valuenow');
  const workflow = page.getByRole('navigation', { name: 'Workflow' });
  await workflow.getByRole('button', { name: 'Convert', exact: true }).click();
  await expect(page.locator('.timeline-track')).toHaveCount(0);
  await workflow.getByRole('button', { name: 'Editor', exact: true }).click();
  await expect(page.getByLabel('Trim start', { exact: true })).toHaveAttribute('aria-valuenow', start!);
  await workflow.getByRole('button', { name: 'Convert', exact: true }).click();
  await page.reload();
  await expect(workflow.getByRole('button', { name: 'Convert', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Bring your media together.' })).toBeVisible();
});
