import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { closeEffect } from '../helpers/effects';
let bytes: Buffer;
test.beforeAll(() => {
  const directory = mkdtempSync(join(tmpdir(), 'frame-image-web-'));
  try {
    const path = join(directory, 'photo.png');
    execFileSync(
      resolve('build/media-tools', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
      ['-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240', '-frames:v', '1', '-threads', '1', path],
    );
    bytes = readFileSync(path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
async function importImage(page: import('@playwright/test').Page) {
  await page.goto('/');
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add media', exact: true }).click();
  await (await choosing).setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: bytes });
  await expect(page.getByLabel('Image canvas', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeEnabled();
}
test('edits image layers, paints and exports without a video timeline', async ({
  page,
}, testInfo) => {
  await importImage(page);
  await expect(page.locator('#media-timeline')).toHaveCount(0);
  await expect(page.locator('video')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add Exposure', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Exposure value').fill('1');
  await closeEffect(page);
  await expect(page.getByLabel('Image layers')).toContainText('Exposure');
  await page.getByRole('button', { name: 'Add Painting', exact: true }).click();
  const paint = page.getByLabel('Paint on frame'),
    box = (await paint.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.7, { steps: 15 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Undo stroke', exact: true })).toBeEnabled();
  await closeEffect(page);
  await page.getByRole('button', { name: 'Add Text', exact: true }).click();
  await page.getByLabel('Text content', { exact: true }).fill('Frame image editing');
  await closeEffect(page);
  await expect(page.locator('.caption-position')).toContainText('Frame image editing');
  await page.getByRole('button', { name: 'Expand image canvas', exact: true }).click();
  await expect(page.locator('.image-layers')).toBeHidden();
  await page.getByRole('button', { name: 'Restore image canvas', exact: true }).click();
  await expect(page.locator('.image-layers')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('image-editor.png') });
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Save file' })).toBeVisible({ timeout: 45000 });
  await page.getByRole('tab', { name: 'Export', exact: true }).click();
  await page.getByLabel('Output format', { exact: true }).selectOption('jpeg');
  await expect(page.getByLabel('Image quality', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Export JPEG', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Save file' })).toHaveAttribute(
    'download',
    /\.jpeg$/,
    { timeout: 45000 },
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('image-editor-mobile.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('browser FFmpeg exports every image format and renders every new visual filter', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async (data) => {
    const enginePath = '/src/engines/browser.ts',
      typesPath = '/src/core/types.ts',
      visualPath = '/src/core/visual-settings.ts';
    const engineModule = (await import(
        /* @vite-ignore */ enginePath
      )) as typeof import('../../src/engines/browser'),
      types = (await import(/* @vite-ignore */ typesPath)) as typeof import('../../src/core/types'),
      visual = (await import(
        /* @vite-ignore */ visualPath
      )) as typeof import('../../src/core/visual-settings');
    const engine = engineModule.createBrowserEngine(),
      file = new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], 'photo.png', {
        type: 'image/png',
      }),
      report = await engine.importFiles([file]);
    if (!report.assets.length) throw new Error(JSON.stringify(report.issues));
    const asset = report.assets[0];
    const failures: string[] = [];
    for (const format of ['png', 'jpeg', 'webp', 'bmp', 'tiff'])
      try {
        const output = await engine.export(
          asset,
          {
            ...types.defaultSettings(asset),
            format: format as import('../../src/core/types').FormatId,
          },
          () => {},
        );
        if (!output?.size) throw new Error('Empty output');
        if (output.url) URL.revokeObjectURL(output.url);
      } catch (error) {
        failures.push(`${format}: ${(error as Error).message}`);
      }
    for (const id of visual.visualIds)
      try {
        const edit = {
            ...types.defaultSettings(asset),
            visual: { ...visual.defaultVisual(), [id]: visual.visualControls[id].initial },
          },
          output = await engine.export(asset, edit, () => {});
        if (!output?.size) throw new Error('Empty output');
        if (output.url) URL.revokeObjectURL(output.url);
      } catch (error) {
        failures.push(`${id}: ${(error as Error).message}`);
      }
    await engine.release(asset);
    return failures;
  }, bytes.toString('base64'));
  expect(result).toEqual([]);
});
