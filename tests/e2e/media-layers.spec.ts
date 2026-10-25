import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { encodePixelsPng } from '../../src/core/png-encoding';
const image = (color: number[]) => {
  const pixels = new Uint8ClampedArray(160 * 120 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set(color, i);
  return Buffer.from(encodePixelsPng(160, 120, pixels));
};
test('layers library pictures in an image project, edits the frame object and exports their composite', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.getByLabel('Autosave status')).toHaveText(/ready|saved|disabled/i, {
    timeout: 15000,
  });
  await page.getByLabel('Choose media files', { exact: true }).setInputFiles([
    { name: 'base.png', mimeType: 'image/png', buffer: image([20, 40, 180, 255]) },
    { name: 'overlay.png', mimeType: 'image/png', buffer: image([220, 40, 20, 255]) },
  ]);
  await page
    .getByRole('button', { name: 'Layer overlay.png over current media', exact: true })
    .click();
  await page.getByRole('button', { name: 'Fill frame', exact: true }).click();
  await page.getByLabel('Media layer width', { exact: true }).fill('50');
  await page.getByLabel('Media layer height', { exact: true }).fill('50');
  await expect(page.locator('.image-canvas-frame')).toHaveAttribute('aria-busy', 'false', {
    timeout: 30000,
  });
  await expect(page.getByLabel('Image layers')).toContainText('overlay.png');
  const object = page.getByRole('button', { name: 'Move overlay.png layer', exact: true }),
    box = (await object.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5 + 35, box.y + box.height * 0.5 + 20, { steps: 6 });
  await page.mouse.up();
  expect(
    Number(await page.getByLabel('Media layer x', { exact: true }).inputValue()),
  ).toBeGreaterThan(0);
  await expect(page.locator('.image-canvas-frame')).toHaveAttribute('aria-busy', 'false', {
    timeout: 30000,
  });
  await page.screenshot({ path: info.outputPath('image-photo-layer.png') });
  await page.getByRole('button', { name: 'Close media layer settings', exact: true }).click();
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Save file', exact: true })).toBeVisible({
    timeout: 45000,
  });
  const colors = await page
    .getByRole('link', { name: 'Save file', exact: true })
    .evaluate(async (el) => {
      const img = new Image();
      img.src = (el as HTMLAnchorElement).href;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const c = canvas.getContext('2d')!;
      c.drawImage(img, 0, 0);
      return {
        over: Array.from(c.getImageData(40, 30, 1, 1).data),
        base: Array.from(c.getImageData(140, 100, 1, 1).data),
      };
    });
  expect(colors.over[0]).toBeGreaterThan(180);
  expect(colors.base[2]).toBeGreaterThan(150);
});
test('adds independent video tracks with linked audio, timeline editing and automatic recovery', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
  await page.goto('/');
  await expect(page.getByLabel('Autosave status')).toHaveText(/ready|saved|disabled/i, {
    timeout: 15000,
  });
  const buffer = await readFile(resolve('tests/fixtures/sample.mp4'));
  await page
    .getByLabel('Choose media files', { exact: true })
    .setInputFiles(
      ['Base.mp4', 'Overlay.mp4'].map((name) => ({ name, mimeType: 'video/mp4', buffer })),
    );
  await page
    .getByRole('button', { name: 'Layer Overlay.mp4 over current media', exact: true })
    .click();
  await expect(page.getByLabel('Visual media tracks', { exact: true })).toBeVisible();
  await expect(page.locator('.visual-media-bar')).toHaveCount(1);
  await expect(page.locator('.audio-layer-bar')).toHaveCount(1);
  await page.getByLabel('Media layer x', { exact: true }).fill('10');
  await page.getByLabel('Media layer opacity', { exact: true }).fill('0.7');
  await page.getByRole('button', { name: 'Close media layer settings', exact: true }).click();
  // The layer composites live above the source video; only its linked audio is rendered.
  const base = page.locator('video[data-frame-source]'),
    layer = page.locator('video[data-live-media-layer]');
  await expect(layer).toHaveJSProperty('readyState', 4, { timeout: 30000 });
  await expect(page.locator('.live-media-layer')).toHaveCSS('opacity', '0.7');
  await expect(base).not.toHaveAttribute('data-preview-effects', 'rendered');
  await expect(page.locator('audio[data-preview-audio="processed"]')).toHaveJSProperty(
    'readyState',
    4,
    { timeout: 60000 },
  );
  await expect(base).not.toHaveAttribute('data-preview-preparing', 'true', { timeout: 60000 });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(layer).toHaveJSProperty('paused', false);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const base = document.querySelector<HTMLVideoElement>('video[data-frame-source]')!,
          layer = document.querySelector<HTMLVideoElement>('video[data-live-media-layer]')!;
        return Math.abs(base.currentTime - layer.currentTime);
      }),
    )
    .toBeLessThan(0.25);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(layer).toHaveJSProperty('paused', true);
  const body = page.getByRole('button', { name: 'Visual track 1: Overlay.mp4', exact: true }),
    bounds = (await body.boundingBox())!;
  await page.mouse.click(bounds.x + bounds.width * 0.4, bounds.y + bounds.height * 0.5, {
    button: 'right',
  });
  await page.getByRole('menuitem', { name: 'Split here', exact: true }).click();
  await expect(page.locator('.visual-media-bar')).toHaveCount(2);
  await expect(page.locator('.audio-layer-bar')).toHaveCount(2);
  const first = page.getByRole('button', { name: 'Visual track 1: Overlay.mp4', exact: true });
  await first.click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Delete/ }).click();
  await expect(page.locator('.visual-media-bar')).toHaveCount(1);
  await expect(page.locator('.audio-layer-bar')).toHaveCount(1);
  await expect(page.getByLabel('Autosave status')).toHaveText(/saved|ready/i, { timeout: 15000 });
  await page.reload();
  await expect(page.locator('.visual-media-bar')).toHaveCount(1, { timeout: 60000 });
  await expect(page.locator('.audio-layer-bar')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('video-tracks.png') });
  await page.getByRole('button', { name: 'Export MP4', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Save file', exact: true })).toBeVisible({
    timeout: 60000,
  });
});
