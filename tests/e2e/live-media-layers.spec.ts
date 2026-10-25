import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { encodePixelsPng } from '../../src/core/png-encoding';
import { closeEffect, openEffect } from '../helpers/effects';

const picture = () => {
  const pixels = new Uint8ClampedArray(160 * 120 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([120, 40, 20, 255], i);
  return Buffer.from(encodePixelsPng(160, 120, pixels));
};
/** Mean RGB of a square around a point, in fractions of the decoded image. */
const sample = (page: Page, url: string, points: [number, number][]) =>
  page.evaluate(
    async ({ url, points }) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return points.map(([x, y]) => {
        const data = context.getImageData(
          Math.round(x * canvas.width) - 3,
          Math.round(y * canvas.height) - 3,
          6,
          6,
        ).data;
        const sum = [0, 0, 0];
        for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += data[i + c];
        return sum.map((value) => value / (data.length / 4));
      });
    },
    { url, points },
  );

for (const crop of [null, { x: 80, y: 40, width: 400, height: 240 }])
  test(`composites graded picture layers live and matches the exported frame${crop ? ' in a crop' : ''}`, async ({
    page,
  }) => {
    test.setTimeout(150000);
    await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
    await page.goto('/');
    await expect(page.getByLabel('Autosave status')).toHaveText(/ready|saved|disabled/i, {
      timeout: 15000,
    });
    await page.getByLabel('Choose media files', { exact: true }).setInputFiles([
      {
        name: 'Base.mp4',
        mimeType: 'video/mp4',
        buffer: await readFile(resolve('tests/fixtures/sample.mp4')),
      },
      { name: 'badge.png', mimeType: 'image/png', buffer: picture() },
    ]);
    if (crop) {
      await openEffect(page, 'Crop');
      await page.getByRole('button', { name: 'Set custom crop', exact: true }).click();
      for (const key of ['width', 'height', 'x', 'y'] as const)
        await page.getByLabel(`Crop ${key}`, { exact: true }).fill(String(crop[key]));
      await closeEffect(page);
    }
    await page
      .getByRole('button', { name: 'Layer badge.png over current media', exact: true })
      .click();
    await page.getByLabel('Media layer x', { exact: true }).fill('10');
    await page.getByLabel('Media layer y', { exact: true }).fill('10');
    await page.getByLabel('Media layer opacity', { exact: true }).fill('0.6');
    await page.getByText('Layer appearance', { exact: true }).click();
    await page.getByLabel('Exposure value', { exact: true }).fill('1');
    const base = page.locator('video[data-frame-source]'),
      grade = page.locator('canvas[data-layer-grade]');
    await expect(grade).toHaveCount(1);
    await expect(page.locator('img[data-live-media-layer]')).toHaveJSProperty('complete', true);
    // Every layer edit stays live: nothing renders the picture.
    await expect(base).not.toHaveAttribute('data-preview-effects', 'rendered');
    await expect(base).not.toHaveAttribute('data-preview-preparing', 'true');
    await page.getByRole('button', { name: 'Close media layer settings', exact: true }).click();
    await base.evaluate(async (video: HTMLVideoElement) => {
      video.currentTime = 1;
      await new Promise((done) => video.addEventListener('seeked', done, { once: true }));
    });
    await page.waitForTimeout(500);
    const frame = page.locator('.media-frame');
    const live = `data:image/png;base64,${(await frame.screenshot()).toString('base64')}`;
    // Inside the 160 × 120 picture (fitted into the 40% box at 10%, 10%) and outside it.
    const points: [number, number][] = [
      [0.3, 0.3],
      [0.8, 0.8],
    ];
    // The preview shows the whole source with the crop outlined.
    const shown = await sample(
      page,
      live,
      crop
        ? points.map(([x, y]) => [
            (crop.x + x * crop.width) / 640,
            (crop.y + y * crop.height) / 360,
          ])
        : points,
    );

    await page.getByRole('button', { name: 'Export MP4', exact: true }).click();
    const link = page.getByRole('link', { name: 'Save file', exact: true });
    await expect(link).toBeVisible({ timeout: 90000 });
    const exported = await link.evaluate(async (anchor: HTMLAnchorElement) => {
      const video = document.createElement('video');
      video.muted = true;
      video.src = anchor.href;
      await new Promise((done) => video.addEventListener('loadeddata', done, { once: true }));
      video.currentTime = 1;
      await new Promise((done) => video.addEventListener('seeked', done, { once: true }));
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')!.drawImage(video, 0, 0);
      return canvas.toDataURL('image/png');
    });
    const expected = await sample(page, exported, points);
    // The graded layer is far brighter than its source over the dark base.
    expect(expected[0][0]).toBeGreaterThan(130);
    for (const [index] of points.entries())
      for (let c = 0; c < 3; c++)
        expect(
          Math.abs(shown[index][c] - expected[index][c]),
          `point ${index} channel ${c}`,
        ).toBeLessThan(14);
  });
