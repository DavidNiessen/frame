import { test, expect } from '@playwright/test';
import { importTestMedia } from '../helpers/import-media';
import { closeEffect } from '../helpers/effects';

for (const width of [1440, 390]) test(`keeps independent track effects across splits at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
  await page.goto('/'); await importTestMedia(page); await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  const add = async (name: string) => page.getByRole('button', { name: `Add ${name}`, exact: true }).click();
  await add('Video fade out');
  const fade = page.getByRole('button', { name: 'Video fade out effect', exact: true });
  await fade.click(); await page.getByLabel('Video fade out duration', { exact: true }).fill('2'); await closeEffect(page);
  await page.getByLabel('Seek playhead').fill('5'); await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(page.locator('.timeline-clip')).toHaveCount(2); await expect(fade).toHaveCount(1);
  await expect(page.getByLabel('Video fade out effect start', { exact: true })).toHaveAttribute('aria-valuenow', '4');
  await page.getByLabel('Seek playhead').fill('4.5'); await expect(page.locator('video')).toHaveCSS('opacity', '0.75');
  await page.getByLabel('Seek playhead').fill('5.5'); await expect(page.locator('video')).toHaveCSS('opacity', '0.25');
  await page.getByLabel('Seek playhead').fill('2'); await add('Video fade out');
  const second = page.getByRole('button', { name: 'Video fade out instance 2 effect', exact: true });
  await expect(second).toHaveCount(1);
  expect(await fade.evaluate(node => node.closest('.timeline-lane')!.contains([...document.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === 'Video fade out instance 2 effect')!))).toBe(false);
  await second.press('Shift+ArrowRight'); await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Video fade out instance 2 effect start', { exact: true })).toHaveAttribute('aria-valuenow', '2.1'); await closeEffect(page);
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await expect(page.getByLabel('Video fade out instance 2 effect start', { exact: true })).toHaveAttribute('aria-valuenow', '2');
  const end = page.getByLabel('Video fade out instance 2 effect end', { exact: true });
  for (let i = 0; i < 3; i++) await end.press('PageUp'); await closeEffect(page);
  await expect(end).toHaveAttribute('aria-valuenow', '5.5');
  await add('Equalizer'); await add('Equalizer');
  const eq = page.getByRole('button', { name: 'Equalizer instance 2 effect', exact: true });
  await eq.press('Shift+ArrowRight'); await expect(page.getByRole('dialog')).toBeVisible(); await closeEffect(page);
  await page.getByLabel('Seek playhead').fill('4'); await add('Captions'); await add('Watermark');
  await expect(page.getByRole('button', { name: 'Caption 1', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Watermark effect', exact: true })).toHaveCount(1);
  await page.getByLabel('Seek playhead').fill('5.5'); await expect(page.getByRole('button', { name: 'Move caption 1', exact: true })).toBeVisible();
  await expect(page.getByLabel('Autosave status')).toHaveText('Workspace autosaved'); await page.reload();
  await expect(fade).toHaveCount(1); await expect(second).toHaveCount(1); await expect(end).toHaveAttribute('aria-valuenow', '5.5');
  await page.getByRole('button', { name: 'Remove Video fade out instance 2 effect', exact: true }).click(); await expect(second).toHaveCount(0); await expect(fade).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('exports a track fade once after splitting through the browser engine', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
  await page.goto('/'); await importTestMedia(page);
  await page.getByRole('button', { name: 'Add Audio fade out', exact: true }).click();
  await page.getByRole('button', { name: 'Audio fade out effect', exact: true }).click();
  await page.getByLabel('Audio fade out duration', { exact: true }).fill('2'); await closeEffect(page);
  await page.getByLabel('Seek playhead').fill('5'); await page.getByRole('button', { name: 'Split', exact: true }).click();
  await page.getByRole('tab', { name: 'Export', exact: true }).click(); await page.getByLabel('Output format', { exact: true }).selectOption('wav');
  await page.getByRole('button', { name: 'Export WAV', exact: true }).click(); await expect(page.getByRole('link', { name: 'Save file', exact: true })).toBeVisible({ timeout: 45000 });
  const downloading = page.waitForEvent('download'); await page.getByRole('link', { name: 'Save file', exact: true }).click(); const path = info.outputPath('track-fade.wav'); await (await downloading).saveAs(path);
  const { execFile } = await import('node:child_process'), { promisify } = await import('node:util'), { ffmpegPath } = await import('../../electron/native');
  const exec = promisify(execFile);
  async function energy(file: string, time: number) { const { stdout } = await exec(ffmpegPath()!, ['-v', 'error', '-ss', String(time), '-i', file, '-t', '0.04', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { encoding: 'buffer' }); let sum = 0; for (let i = 0; i < stdout.length; i += 4) sum += stdout.readFloatLE(i)**2; return sum; }
  for (const [time, gain] of [[3, 1], [4.5, .74], [5.5, .24]]) expect(await energy(path, time) / await energy('tests/fixtures/sample.mp4', time)).toBeCloseTo(gain**2, 2);
});
