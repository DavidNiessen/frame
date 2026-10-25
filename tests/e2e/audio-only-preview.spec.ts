import { test, expect } from '@playwright/test';
import { importTestMedia } from '../helpers/import-media';
import { openEffect } from '../helpers/effects';

test('loudness normalization renders only the soundtrack while the source video keeps playing', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
  await page.goto('/');
  await importTestMedia(page);
  const video = page.locator('video'),
    soundtrack = page.locator('audio[data-preview-audio="processed"]');
  const original = await video.getAttribute('src');
  await openEffect(page, 'Normalize loudness');
  await expect(soundtrack).toHaveJSProperty('readyState', 4, { timeout: 45000 });
  await expect(video).toHaveAttribute('data-preview-audio', 'separate');
  await expect(video).toHaveAttribute('src', original!);
  await expect(video).not.toHaveAttribute('data-preview-effects', 'rendered');
  await expect(video).not.toHaveAttribute('data-preview-preparing', 'true');
  const rendered = await soundtrack.getAttribute('src');

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(video).toHaveJSProperty('paused', false);
  await expect(soundtrack).toHaveJSProperty('paused', false);
  await expect(video).toHaveJSProperty('volume', 0);
  // The soundtrack follows the picture in output time.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const picture = document.querySelector('video')!,
          sound = document.querySelector<HTMLAudioElement>('audio[data-preview-audio]')!;
        return Math.abs(picture.currentTime - sound.currentTime);
      }),
    )
    .toBeLessThan(0.2);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(soundtrack).toHaveJSProperty('paused', true);

  // Grading runs on the GPU, so it reuses the rendered soundtrack.
  await openEffect(page, 'Color & LUTs');
  await page.getByLabel('Color contrast', { exact: true }).fill('1.5');
  await expect(page.locator('canvas[data-realtime-grade]')).toHaveCount(1);
  await expect(soundtrack).toHaveAttribute('src', rendered!);
  await expect(video).toHaveAttribute('src', original!);
  await expect(video).not.toHaveAttribute('data-preview-preparing', 'true');

  // Removing the correction returns the source audio at once.
  const undo = page.getByRole('button', { name: 'Undo edit', exact: true });
  await expect(async () => {
    if (await soundtrack.count()) await undo.click();
    await expect(soundtrack).toHaveCount(0, { timeout: 500 });
  }).toPass();
  await expect(video).not.toHaveAttribute('data-preview-audio', 'separate');
});
