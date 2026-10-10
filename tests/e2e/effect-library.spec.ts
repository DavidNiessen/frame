import { closeEffect, openEffect, openCaptionTools } from '../helpers/effects';
import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffprobe from '@ffprobe-installer/ffprobe';
const exec = promisify(execFile);

test('keeps the opposite caption boundary when resizing a cue that spans split clips', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample', exact: true }).click();
  await page.getByLabel('Seek playhead').fill('2'); await page.getByRole('button', { name: 'Split', exact: true }).click();
  await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click(); await openCaptionTools(page);
  await page.getByLabel('Import subtitle file').setInputFiles({ name: 'spanning.srt', mimeType: 'text/plain', buffer: Buffer.from('1\n00:00:01,000 --> 00:00:05,000\nAcross both clips\n') });
  await page.locator('.timeline-track-filters').getByRole('button', { name: 'captions', exact: true }).click();
  await page.getByLabel('Caption 1 start', { exact: true }).first().press('Shift+ArrowRight');
  await openEffect(page, 'Captions'); await expect(page.locator('.cue-timing')).toHaveText('1.10–5.00s');
  await page.getByLabel('Caption 1 end', { exact: true }).last().press('Shift+ArrowLeft');
  await openEffect(page, 'Captions'); await expect(page.locator('.cue-timing')).toHaveText('1.10–4.90s');
});

test('plays reordered clips across the source end and restarts at the sequence beginning', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample', exact: true }).click();
  const video = page.locator('video'); await expect(video).toHaveJSProperty('readyState', 4);
  await page.getByLabel('Seek playhead').fill('2'); await page.getByRole('button', { name: 'Split', exact: true }).click();
  await closeEffect(page); await page.getByLabel('Effect target').selectOption({ index: 2 });
  await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click(); await openEffect(page, 'Speed');
  await page.getByLabel('Playback speed').selectOption('4');
  await page.locator('.timeline-clip .range-body').nth(1).press('Alt+ArrowLeft');
  await page.getByRole('button', { name: 'Back to trim start', exact: true }).click(); await expect(video).toHaveJSProperty('currentTime', 2);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => video.evaluate(node => { const media = node as HTMLVideoElement; return !media.paused && media.currentTime < 2 && media.playbackRate === 1; }), { timeout: 8000 }).toBe(true);
  await expect(video).toHaveJSProperty('paused', true, { timeout: 8000 }); await expect(video).toHaveJSProperty('currentTime', 2);
});

test('applies an effect to one split clip, reorders it and exports the sequence', async ({ page }, testInfo) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample', exact: true }).click();
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4, { timeout: 45000 });
  await page.getByLabel('Seek playhead').fill('2'); await page.getByRole('button', { name: 'Split', exact: true }).click();
  await closeEffect(page); await page.getByLabel('Effect target').selectOption({ index: 2 });
  await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click();
  await page.getByLabel('Search effects').fill('speed');
  await expect(page.locator('.effect-card')).toHaveCount(1); await openEffect(page, 'Speed');
  await page.getByLabel('Playback speed').selectOption('2');
  await page.getByLabel('Seek playhead').fill('3'); await expect(page.locator('video')).toHaveJSProperty('playbackRate', 2);
  await page.getByLabel('Seek playhead').fill('1'); await expect(page.locator('video')).toHaveJSProperty('playbackRate', 1);
  await page.locator('.timeline-clip .range-body').nth(1).press('Alt+ArrowLeft');
  await expect(page.getByLabel('Trim start', { exact: true })).toHaveAttribute('aria-valuenow', '2');
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click(); await expect(page.getByLabel('Trim start', { exact: true })).toHaveAttribute('aria-valuenow', '0');
  const bodies = page.locator('.timeline-clip .range-body'), first = (await bodies.first().boundingBox())!, second = (await bodies.nth(1).boundingBox())!;
  await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2); await page.mouse.down(); await page.mouse.move(first.x + 16, first.y + first.height / 2, { steps: 12 }); await page.mouse.up();
  await expect(page.getByLabel('Trim start', { exact: true })).toHaveAttribute('aria-valuenow', '2');
  await page.getByRole('button', { name: 'Fullscreen preview', exact: true }).click();
  await page.getByLabel('Fullscreen playback position').fill('1'); await expect(page.locator('video')).toHaveJSProperty('currentTime', 4);
  await page.getByLabel('Fullscreen playback position').fill('2.5'); await expect(page.locator('video')).toHaveJSProperty('currentTime', .5);
  await page.getByRole('button', { name: 'Exit fullscreen preview', exact: true }).click();
  await page.getByRole('button', { name: 'Generate thumbnails', exact: true }).click();
  await page.getByRole('button', { name: 'Seek thumbnail 1', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluate(node => (node as HTMLVideoElement).currentTime)).toBeCloseTo(2 + 1 / 3, 2);
  await page.getByRole('button', { name: 'Seek thumbnail 12', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluate(node => (node as HTMLVideoElement).currentTime)).toBeCloseTo(2 - 1 / 6, 2);
  await closeEffect(page); await page.getByRole('button', { name: 'Export MP4', exact: true }).click(); await expect(page.getByRole('link', { name: 'Save file', exact: true })).toBeVisible({ timeout: 45000 });
  const pending = page.waitForEvent('download'); await page.getByRole('link', { name: 'Save file', exact: true }).click(); const output = testInfo.outputPath('sequence.mp4'); await (await pending).saveAs(output);
  const { stdout } = await exec(ffprobe.path, ['-v', 'error', '-show_format', '-of', 'json', output]); expect(Number(JSON.parse(stdout).format.duration)).toBeCloseTo(4, 1);
});

test('keeps waveform generation and cancellation independent of editing and export', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Generate waveform', exact: true })).toBeVisible({ timeout: 45000 });
  // Hold the background worker's download so cancellation cannot race a completed waveform.
  let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/ffmpeg-core.wasm', async route => { await pending; await route.continue().catch(() => {}); });
  await page.getByRole('button', { name: 'Generate waveform', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Split', exact: true })).toBeEnabled();
  await openEffect(page, 'Volume'); await page.getByLabel('Volume', { exact: true }).fill('0.5'); await expect(page.locator('video')).toHaveJSProperty('volume', .5);
  await closeEffect(page); await page.getByRole('button', { name: 'Export MP4', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel waveform', exact: true }).click(); release();
  await page.unroute('**/ffmpeg-core.wasm');
  await expect(page.getByRole('link', { name: 'Save file', exact: true })).toBeVisible({ timeout: 45000 });
  await page.getByRole('button', { name: 'Retry waveform', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Audio waveform', exact: true })).toBeVisible({ timeout: 45000 });
});

test('navigates dense tracks without losing clips and pans zoomed tracks from the mini timeline', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample', exact: true }).click();
  await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click(); await openCaptionTools(page);
  const srt = Array.from({ length: 35 }, (_, index) => `${index + 1}\n00:00:00,000 --> 00:00:05,000\nCaption ${index + 1}\n`).join('\n');
  await page.getByLabel('Import subtitle file').setInputFiles({ name: 'dense.srt', mimeType: 'text/plain', buffer: Buffer.from(srt) });
  await closeEffect(page);
  const compact = page.getByRole('button', { name: 'Compact', exact: true });
  if (await compact.getAttribute('aria-pressed') === 'false') await compact.click();
  const tracks = page.getByRole('region', { name: 'Timeline tracks', exact: true });
  await expect(page.getByLabel('Caption 1 start', { exact: true })).toBeHidden();
  await page.locator('.timeline-track-filters').getByRole('button', { name: 'captions', exact: true }).click();
  expect(await tracks.evaluate(node => node.scrollHeight)).toBeGreaterThan(await tracks.evaluate(node => node.clientHeight));
  await tracks.evaluate(node => { node.scrollTop = node.scrollHeight; });
  await expect(page.getByLabel('Trim start', { exact: true })).toBeInViewport();
  await page.locator('.timeline-track-filters').getByRole('button', { name: 'clips', exact: true }).click(); await expect(page.locator('.caption-lane')).toHaveCount(0);
  await page.getByLabel('Timeline zoom', { exact: true }).fill('4'); await page.getByLabel('Timeline horizontal position', { exact: true }).fill('1');
  await expect.poll(() => tracks.evaluate(node => node.scrollLeft)).toBeGreaterThan(1000);
  await page.getByLabel('Seek playhead', { exact: true }).fill('0.1'); await page.getByRole('button', { name: 'Locate playhead', exact: true }).click();
  await expect.poll(() => tracks.evaluate(node => node.scrollLeft)).toBe(0);
});
