import { expect, test } from '@playwright/test';
import { importTestMedia } from '../helpers/import-media';
import { closeEffect } from '../helpers/effects';
for (const width of [1440, 390]) test(`moves and resizes independent adjustments and follows them in playback at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 }); await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
  await page.goto('/'); await expect(page.getByRole('button', { name: 'Try a sample', exact: true })).toHaveCount(0); await expect(page.locator('.sample-card')).toHaveCount(0);
  await importTestMedia(page); await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  await page.getByRole('button', { name: 'Add Volume', exact: true }).click(); await page.getByRole('button', { name: 'Volume effect', exact: true }).click(); await page.getByLabel('Volume', { exact: true }).fill('0.5'); await closeEffect(page);
  const start = page.getByLabel('Volume effect start', { exact: true }); await start.press('PageUp'); await expect(start).toHaveAttribute('aria-valuenow', '1'); await expect(page.getByRole('dialog')).toBeVisible(); await closeEffect(page);
  const end = page.getByLabel('Volume effect end', { exact: true }); for (let i = 0; i < 3; i++) await end.press('PageDown'); await expect(end).toHaveAttribute('aria-valuenow', '3'); await closeEffect(page);
  await page.getByLabel('Seek playhead').fill('2'); await page.getByRole('button', { name: 'Add Volume', exact: true }).click();
  const second = page.getByRole('button', { name: 'Volume instance 2 effect', exact: true }); await second.click(); await page.getByLabel('Volume', { exact: true }).fill('0.4'); await expect(page.locator('video')).toHaveJSProperty('volume', .2); await closeEffect(page);
  await second.press('Shift+ArrowRight'); await expect(page.getByRole('dialog')).toBeVisible(); await expect(page.getByLabel('Volume instance 2 effect start', { exact: true })).toHaveAttribute('aria-valuenow', '2.1'); await closeEffect(page);
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click(); await expect(page.getByLabel('Volume instance 2 effect start', { exact: true })).toHaveAttribute('aria-valuenow', '2');
  await page.getByLabel('Seek playhead').fill('0.5'); await expect(page.locator('video')).toHaveJSProperty('volume', 1);
  await page.getByLabel('Seek playhead').fill('1.5'); await expect(page.locator('video')).toHaveJSProperty('volume', .5);
  await page.getByLabel('Seek playhead').fill('2.5'); await expect(page.locator('video')).toHaveJSProperty('volume', .2);
  await page.getByLabel('Seek playhead').fill('3.5'); await expect(page.locator('video')).toHaveJSProperty('volume', .4);
  await page.getByLabel('Seek playhead').fill('4.5'); await expect(page.locator('video')).toHaveJSProperty('volume', 1);
  for (const name of ['Equalizer', 'Noise reduction', 'Color & LUTs']) {
    await page.getByRole('button', { name: `Add ${name}`, exact: true }).click(); await page.getByRole('button', { name: `Add ${name}`, exact: true }).click();
    const handle = page.getByLabel(`${name} instance 2 effect end`, { exact: true }); await expect(handle).toBeVisible(); await handle.press('PageDown'); await expect(page.getByRole('dialog')).toBeVisible(); await closeEffect(page);
    const body = page.getByRole('button', { name: `${name} instance 2 effect`, exact: true }); await body.press('Shift+ArrowLeft'); await expect(page.getByRole('dialog')).toBeVisible(); await closeEffect(page);
  }
  await expect(page.getByLabel('Autosave status')).toHaveText('Workspace autosaved'); await page.reload(); await expect(start).toHaveAttribute('aria-valuenow', '1'); await expect(end).toHaveAttribute('aria-valuenow', '3');
  await page.getByLabel('Seek playhead').fill('2.5'); await expect(page.locator('video')).toHaveJSProperty('volume', .2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('exports timed overlapping gains through the browser WASM engine', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false')); await page.goto('/'); await importTestMedia(page);
  await page.getByRole('button', { name: 'Add Volume', exact: true }).click(); await page.getByRole('button', { name: 'Volume effect', exact: true }).click(); await page.getByLabel('Volume', { exact: true }).fill('0.5'); await closeEffect(page);
  await page.getByLabel('Volume effect start', { exact: true }).press('PageUp'); await closeEffect(page);
  for (let i = 0; i < 2; i++) await page.getByLabel('Volume effect end', { exact: true }).press('PageDown'); await closeEffect(page);
  await page.getByLabel('Seek playhead').fill('2'); await page.getByRole('button', { name: 'Add Volume', exact: true }).click(); await page.getByRole('button', { name: 'Volume instance 2 effect', exact: true }).click(); await page.getByLabel('Volume', { exact: true }).fill('0.4'); await closeEffect(page);
  await page.getByRole('tab', { name: 'Export', exact: true }).click(); await page.getByLabel('Output format', { exact: true }).selectOption('wav');
  await page.getByRole('button', { name: 'Export WAV', exact: true }).click(); await expect(page.getByRole('link', { name: 'Save file', exact: true })).toBeVisible({ timeout: 45000 });
  const downloading = page.waitForEvent('download'); await page.getByRole('link', { name: 'Save file', exact: true }).click(); const download = await downloading; const path = info.outputPath('timed-volume.wav'); await download.saveAs(path);
  const { execFile } = await import('node:child_process'), { promisify } = await import('node:util'), { ffmpegPath } = await import('../../electron/native');
  const exec = promisify(execFile), ffmpeg = ffmpegPath()!;
  async function energy(file: string, time: number) { const { stdout } = await exec(ffmpeg, ['-v', 'error', '-ss', String(time + .1), '-i', file, '-t', '0.3', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { encoding: 'buffer' }); let sum = 0; for (let i = 0; i < stdout.length; i += 4) sum += stdout.readFloatLE(i)**2; return sum; }
  for (const [time, ratio] of [[0, 1], [1, .25], [2, .04], [4, 1]]) expect(await energy(path, time) / await energy('tests/fixtures/sample.mp4', time)).toBeCloseTo(ratio, 2);
});
