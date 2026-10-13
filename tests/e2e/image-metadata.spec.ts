import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
let data: string;
test.beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'frame-meta-web-'));
  try {
    const path = join(dir, 'photo.png');
    execFileSync(
      resolve('build/media-tools', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
      [
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=64x48',
        '-frames:v',
        '1',
        '-threads',
        '1',
        path,
      ],
    );
    data = readFileSync(path).toString('base64');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('browser conversion preserves edited image credits and excludes GPS in every export format', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async (data) => {
    const enginePath = '/src/engines/browser.ts',
      typesPath = '/src/core/types.ts',
      metaPath = '/src/core/image-metadata.ts',
      exportPath = '/src/core/image-metadata-export.ts';
    const { createBrowserEngine } = await import(/* @vite-ignore */ enginePath),
      { defaultSettings } = await import(/* @vite-ignore */ typesPath),
      { defaultImageMetadata, readImageMetadata } = await import(/* @vite-ignore */ metaPath),
      { writeImageMetadata } = await import(/* @vite-ignore */ exportPath);
    const plain = Uint8Array.from(atob(data), (c) => c.charCodeAt(0)),
      source = {
        kind: 'image',
        width: 64,
        height: 48,
        imageMetadata: {
          author: 'Source author',
          camera: 'Frame Camera',
          latitude: 51.1,
          longitude: -0.6,
        },
      },
      settings = {
        format: 'png',
        keepMetadata: true,
        imageMetadata: { ...defaultImageMetadata(), keepLocation: true },
        geometry: { resize: null, rotation: 0, flipHorizontal: false, flipVertical: false },
        crop: null,
      };
    const bytes = writeImageMetadata(plain, source, settings),
      engine = createBrowserEngine(),
      report = await engine.importFiles([new File([bytes], 'photo.png')]),
      asset = report.assets[0];
    const outputs = [];
    for (const format of ['png', 'jpeg', 'webp', 'tiff']) {
      const edit = {
        ...defaultSettings(asset),
        format,
        imageMetadata: { ...defaultImageMetadata(), copyright: 'New rights' },
      };
      const output = await engine.export(asset, edit, () => {}),
        buffer = new Uint8Array(await (await fetch(output.url)).arrayBuffer());
      outputs.push({ format, tags: await readImageMetadata(buffer), size: output.size });
      URL.revokeObjectURL(output.url);
    }
    await engine.release(asset);
    return { source: asset.imageMetadata, outputs };
  }, data);
  expect(result.source.latitude).toBeCloseTo(51.1);
  for (const item of result.outputs) {
    expect(item.size).toBeGreaterThan(100);
    expect(item.tags.author).toBe('Source author');
    expect(item.tags.copyright).toBe('New rights');
    expect(item.tags.camera).toBe('Frame Camera');
    expect(item.tags.latitude).toBeUndefined();
    expect(item.tags.longitude).toBeUndefined();
  }
});
test('image export exposes credits and privacy controls without changing source data', async ({
  page,
}) => {
  await page.goto('/');
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add media', exact: true }).click();
  await (
    await choosing
  ).setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') });
  await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeEnabled();
  await page.getByRole('tab', { name: 'Export', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Advanced settings' }).click();
  await page.locator('summary').filter({ hasText: 'Image credits & privacy' }).click();
  await page.getByLabel('Image author', { exact: true }).fill('Frame artist');
  await expect(page.getByLabel('Include image location', { exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Save file', exact: true })).toBeVisible({
    timeout: 45000,
  });
});
