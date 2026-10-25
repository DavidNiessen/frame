import { expect, test } from '@playwright/test';
import { importTestMedia } from '../helpers/import-media';
import { closeEffect, openEffect } from '../helpers/effects';

test('reduces noise live while the source plays, without rendering a soundtrack', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
  await page.goto('/');
  await importTestMedia(page);
  const video = page.locator('video[data-frame-source]');
  await expect(video).toHaveJSProperty('readyState', 4);
  const original = await video.getAttribute('src');
  await openEffect(page, 'Noise reduction');
  await page.getByLabel('Noise reduction amount').fill('20');
  await closeEffect(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(video).toHaveJSProperty('paused', false);
  // The reducer runs in the source's audio graph instead of an FFmpeg render.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const path = '/src/core/realtime-audio.ts';
        const { playbackAudio } = await import(/* @vite-ignore */ path);
        const graph = playbackAudio(document.querySelector('video[data-frame-source]')!);
        return !!graph?.connected && !!graph.denoise && graph.noise;
      }),
    )
    .toBe(JSON.stringify([{ strength: 20, floor: -50 }]));
  await expect(page.locator('audio[data-preview-audio="processed"]')).toHaveCount(0);
  await expect(video).not.toHaveAttribute('data-preview-audio', 'separate');
  await expect(video).not.toHaveAttribute('data-preview-preparing', 'true');
  await expect(video).toHaveAttribute('src', original!);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
});
