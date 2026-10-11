import { test, expect } from '@playwright/test';
import { importTestMedia } from '../helpers/import-media';
import { openEffect } from '../helpers/effects';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ffmpegPath } from '../../electron/native';
test('moves loading light through the footer without shifting layout and respects reduced motion', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
  await page.goto('/');
  await importTestMedia(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.context().route('**/ffmpeg/ffmpeg-core.wasm', async (route) => {
    await gate;
    await route.continue().catch(() => {});
  });
  try {
    const footer = page.getByRole('contentinfo', { name: 'Workspace status' }),
      beam = footer.locator('.loading-beam');
    await expect(footer).toHaveAttribute('aria-busy', 'false');
    const bounds = await footer.boundingBox();
    await openEffect(page, 'Equalizer');
    await page.getByLabel('Equalizer mid', { exact: true }).fill('-6');
    await expect(beam).toHaveAttribute('data-active', 'true');
    await expect(footer.getByRole('button', { name: 'Keyboard shortcuts' })).toBeHidden();
    await expect(footer.getByLabel('Autosave status')).toBeHidden();
    await expect(page.locator('progress, [role=progressbar]')).toHaveCount(0);
    const positions = await beam.locator('span').evaluate(async (node) => {
      const positions: string[] = [];
      for (let i = 0; i < 12; i++) {
        await new Promise(requestAnimationFrame);
        positions.push(getComputedStyle(node).transform);
      }
      return positions;
    });
    expect(new Set(positions).size).toBeGreaterThan(5);
    expect(await footer.boundingBox()).toEqual(bounds);
    await page.screenshot({ path: 'test-results/browser/footer-loading-beam.png' });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(beam.locator('span')).toHaveCSS('animation-name', 'none');
    await page.getByRole('button', { name: 'Remove Equalizer', exact: true }).click();
    await expect(footer).toHaveAttribute('aria-busy', 'false');
    await expect(beam).toHaveAttribute('data-active', 'false');
    await expect(footer.getByRole('button', { name: 'Keyboard shortcuts' })).toBeVisible();
  } finally {
    release();
  }
});
test('keeps export progress and cancellation in the bottom island at desktop and mobile sizes', async ({
  page,
}, testInfo) => {
  const source = testInfo.outputPath('long-video.mp4');
  await promisify(execFile)(ffmpegPath(), [
    '-y',
    '-stream_loop',
    '4',
    '-i',
    'tests/fixtures/sample.mp4',
    '-c',
    'copy',
    source,
  ]);
  await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
  await page.goto('/');
  await expect(page.getByLabel('Autosave status')).toHaveText('Autosave ready');
  await page.getByLabel('Choose media files').setInputFiles(source);
  await expect(page.locator('.asset-list li')).toHaveCount(1, { timeout: 45000 });
  await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Export MP4', exact: true }).click();
  const footer = page.getByRole('contentinfo', { name: 'Workspace status' });
  await expect(footer.getByRole('status')).toContainText('Exporting media');
  await expect(footer.locator('.footer-task-percent')).toHaveText(/\d+%/);
  for (const width of [1440, 850, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await footer.scrollIntoViewIfNeeded();
    await expect(footer.getByRole('button', { name: 'Cancel export' })).toBeInViewport();
    await expect(footer.locator('.footer-task-percent')).toBeInViewport();
    const island = (await footer.boundingBox())!,
      activity = (await footer.getByRole('status').boundingBox())!;
    expect(Math.abs(activity.x + activity.width / 2 - island.x - island.width / 2)).toBeLessThan(
      1.5,
    );
    await expect(footer.getByRole('status')).toHaveCSS('font-size', '12px');
    await expect(footer.getByRole('button', { name: 'Keyboard shortcuts' })).toBeHidden();
    await expect(footer.getByLabel('Autosave status')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.screenshot({ path: 'test-results/browser/footer-export-mobile.png', fullPage: true });
  await footer.getByRole('button', { name: 'Cancel export' }).click();
  await expect(footer).toHaveAttribute('aria-busy', 'false');
  await expect(footer.getByRole('status')).toContainText('All processing happens on your device');
  await expect(footer.getByRole('button', { name: 'Keyboard shortcuts' })).toBeVisible();
});
