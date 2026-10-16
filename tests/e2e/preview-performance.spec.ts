import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { importTestMedia } from '../helpers/import-media';
import { openEffect } from '../helpers/effects';

test('EQ changes update the playing audio graph without encoding or replacing the video', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('frame:auto-waveforms', 'false');
    const filters: BiquadFilterNode[] = [];
    (window as typeof window & { testEqualizers: BiquadFilterNode[] }).testEqualizers = filters;
    const create = AudioContext.prototype.createBiquadFilter;
    AudioContext.prototype.createBiquadFilter = function () {
      const filter = create.call(this);
      filters.push(filter);
      return filter;
    };
  });
  await page.goto('/');
  await importTestMedia(page);
  const video = page.locator('video');
  const original = await video.getAttribute('src');
  await openEffect(page, 'Equalizer');
  await page.getByLabel('Equalizer mid', { exact: true }).fill('-12');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(video).toHaveJSProperty('paused', false);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as typeof window & { testEqualizers: BiquadFilterNode[] }).testEqualizers.map(
          (filter) => filter.gain.value,
        ),
      ),
    )
    .toEqual([0, -12, 0]);
  await page.getByLabel('Equalizer mid', { exact: true }).fill('6');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { testEqualizers: BiquadFilterNode[] }).testEqualizers[1]?.gain
            .value,
      ),
    )
    .toBe(6);
  await expect(video).toHaveAttribute('src', original!);
  await expect(video).not.toHaveAttribute('data-preview-effects', 'rendered');
});

test('browser previews mount large-file inputs and reuse one WASM runtime between completed edits', async ({
  page,
}) => {
  await page.goto('/');
  let loads = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/ffmpeg/ffmpeg-core.wasm')) loads++;
  });
  const base64 = (await readFile('tests/fixtures/sample.mp4')).toString('base64');
  const result = await page.evaluate(async (encoded) => {
    const engineUrl = '/src/engines/browser-joined-preview.ts',
      typesUrl = '/src/core/types.ts';
    const { browserJoinedPreview } = await import(/* @vite-ignore */ engineUrl);
    const { defaultSettings } = await import(/* @vite-ignore */ typesUrl);
    const file = new File([Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))], 'source.mp4');
    // WORKERFS must access Blob slices, not eagerly copy the movie through this API.
    file.arrayBuffer = () => Promise.reject(new Error('Unexpected full-file copy'));
    const asset = {
      id: 'test',
      name: file.name,
      size: file.size,
      kind: 'video',
      width: 640,
      height: 360,
      hasAudio: true,
      duration: 6,
      previewUrl: '',
    };
    const engine = browserJoinedPreview(new Map([[asset.id, file]]), new Map([[asset.id, asset]]));
    const edit = defaultSettings(asset);
    const first = await engine.effects(
      asset,
      { ...edit, color: { ...edit.color, contrast: 1.2 } },
      () => {},
    );
    const second = await engine.effects(
      asset,
      { ...edit, color: { ...edit.color, contrast: 1.4 } },
      () => {},
    );
    const sizes = [first.size, second.size];
    await engine.release(first.id);
    await engine.release(second.id);
    await engine.releaseAsset(asset.id);
    return sizes;
  }, base64);
  expect(result.every((size) => size > 1000)).toBe(true);
  expect(loads).toBe(1);
});

test('undo and redo reuse completed visual previews immediately', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
  await page.goto('/');
  await importTestMedia(page);
  await openEffect(page, 'Color & LUTs');
  const video = page.locator('video'),
    contrast = page.getByLabel('Color contrast', { exact: true });
  await contrast.fill('1.25');
  await expect(video).toHaveAttribute('data-preview-effects', 'rendered', { timeout: 45000 });
  await expect(video).not.toHaveAttribute('data-preview-preparing', 'true');
  const first = await video.getAttribute('src');
  await contrast.fill('1.75');
  await expect(video).not.toHaveAttribute('src', first!, { timeout: 45000 });
  await expect(video).not.toHaveAttribute('data-preview-preparing', 'true');
  const second = await video.getAttribute('src');
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await expect(video).toHaveAttribute('src', first!, { timeout: 2000 });
  await page.getByRole('button', { name: 'Redo edit', exact: true }).click();
  await expect(video).toHaveAttribute('src', second!, { timeout: 2000 });
});
