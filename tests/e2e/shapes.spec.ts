import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
let bytes: Buffer;
test.beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'frame-shape-web-'));
  try {
    const path = join(dir, 'source.png');
    execFileSync(
      resolve('build/media-tools', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
      [
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=320x240',
        '-frames:v',
        '1',
        '-threads',
        '1',
        path,
      ],
    );
    bytes = readFileSync(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('edits vector shapes with guides and snapping on an image', async ({ page }, info) => {
  await page.goto('/');
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add media', exact: true }).click();
  await (await choosing).setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: bytes });
  await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Add Shape', exact: true }).click();
  await page.getByLabel('Shape type', { exact: true }).selectOption('rounded');
  await page.getByLabel('Shape fill color', { exact: true }).fill('#ef668f');
  await page.getByRole('button', { name: 'Canvas guides and snapping', exact: true }).click();
  await page.getByLabel('Canvas guide grid', { exact: true }).selectOption('thirds');
  await expect(page.locator('.canvas-grid-line')).toHaveCount(4);
  await page.getByRole('button', { name: 'Canvas guides and snapping', exact: true }).click();
  const shape = page.getByRole('button', { name: 'Move shape 1', exact: true }),
    box = (await shape.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 5, box.y + box.height / 2, { steps: 3 });
  await expect(page.locator('.canvas-snap-line')).not.toHaveCount(0);
  await page.mouse.up();
  await expect(page.getByLabel('Shape x', { exact: true })).toHaveValue('30');
  await page.keyboard.down('Alt');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2 - 20, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  expect(Number(await page.getByLabel('Shape x', { exact: true }).inputValue())).toBeGreaterThan(
    30,
  );
  await page.screenshot({ path: info.outputPath('shape-editor.png') });
  await page.getByRole('button', { name: 'Close effect settings', exact: true }).click();
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Save file', exact: true })).toBeVisible({
    timeout: 45000,
  });
});
test('browser exports every analytic shape and a timed video shape', async ({ page }) => {
  await page.goto('/');
  const failures = await page.evaluate(async (data) => {
    const enginePath = '/src/engines/browser.ts',
      typesPath = '/src/core/types.ts',
      shapesPath = '/src/core/shapes.ts',
      timelinePath = '/src/core/timeline-effects.ts';
    const { createBrowserEngine } = await import(/* @vite-ignore */ enginePath),
      { defaultSettings } = await import(/* @vite-ignore */ typesPath),
      { defaultShape, shapeKinds } = await import(/* @vite-ignore */ shapesPath),
      { addTimelineEffect } = await import(/* @vite-ignore */ timelinePath),
      engine = createBrowserEngine();
    const { assets } = await engine.importFiles([
        new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], 'photo.png'),
      ]),
      asset = assets[0],
      failures: string[] = [];
    for (const kind of shapeKinds)
      try {
        const output = await engine.export(
          asset,
          { ...defaultSettings(asset), shape: { ...defaultShape(), kind, rotation: 20 } },
          () => {},
        );
        if (!output.size) throw new Error('Empty output');
        URL.revokeObjectURL(output.url);
      } catch (error) {
        failures.push(kind + ': ' + (error as Error).message);
      }
    try {
      const video = { ...asset, kind: 'video' },
        edit = defaultSettings(video),
        patch = addTimelineEffect(edit, video, 'shape'),
        output = await engine.export(video, { ...edit, ...patch }, () => {});
      if (!output.size) throw new Error('Empty video');
      URL.revokeObjectURL(output.url);
    } catch (error) {
      failures.push('video: ' + (error as Error).message);
    }
    await engine.release(asset);
    return failures;
  }, bytes.toString('base64'));
  expect(failures).toEqual([]);
});
