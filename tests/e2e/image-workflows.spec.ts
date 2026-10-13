import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import ffprobe from '@ffprobe-installer/ffprobe';
let bytes: Buffer;
test.beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'frame-image-workflows-'));
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
test('bulk resizes images and saves a reusable custom size', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Convert', exact: true }).click();
  await page.getByLabel('Choose media files', { exact: true }).setInputFiles([
    { name: 'one.png', mimeType: 'image/png', buffer: bytes },
    { name: 'two.png', mimeType: 'image/png', buffer: bytes },
  ]);
  await page.getByLabel('Image size preset', { exact: true }).selectOption('3');
  await page.getByLabel('Resize width').fill('64');
  await expect(page.getByLabel('Batch image size')).toContainText('320 × 240 → 64 × 48');
  await page.getByText('Save a size preset', { exact: true }).click();
  await page.getByLabel('Size preset name').fill('Small web images');
  await page.getByLabel('Save image size preset', { exact: true }).click();
  await expect(page.getByLabel('Image size preset', { exact: true })).toContainText(
    'Small web images',
  );
  await page.getByRole('button', { name: 'Convert 2 files', exact: true }).click();
  const save = page.getByRole('link', { name: 'Download one.png', exact: true });
  await expect(save).toBeVisible({ timeout: 45000 });
  const downloading = page.waitForEvent('download');
  await save.click();
  const path = info.outputPath('resized.png');
  await (await downloading).saveAs(path);
  const size = execFileSync(
    ffprobe.path,
    ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'json', path],
    { encoding: 'utf8' },
  );
  expect(JSON.parse(size).streams[0]).toMatchObject({ width: 64, height: 48 });
});

test('edits curve points on an image and exports the browser result', async ({ page }) => {
  await page.goto('/');
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add media', exact: true }).click();
  await (await choosing).setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: bytes });
  await expect(page.getByLabel('Image canvas', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Add Curves', exact: true }).click();
  const graph = page.getByRole('application', {
      name: 'Tone curve · click to add, drag to adjust',
    }),
    box = (await graph.boundingBox())!;
  await graph.click({ position: { x: box.width * 0.5, y: box.height * 0.3 } });
  await expect(page.getByLabel('Curve point output', { exact: true })).toHaveValue(
    /17[0-9]|18[0-9]/,
  );
  await page.getByLabel('Curve channel', { exact: true }).selectOption('red');
  await page.getByRole('button', { name: 'Lift shadows', exact: true }).click();
  await page.getByRole('button', { name: 'Close effect settings', exact: true }).click();
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Save file', exact: true })).toBeVisible({
    timeout: 45000,
  });
});

test('browser composites every image blend mode through real exports', async ({ page }) => {
  await page.goto('/');
  const results = await page.evaluate(async (data) => {
    const path = '/src/engines/browser.ts',
      typesPath = '/src/core/types.ts',
      visualPath = '/src/core/visual-settings.ts',
      blendsPath = '/src/core/image-compositing.ts',
      paintPath = '/src/core/painting.ts';
    const { createBrowserEngine } = await import(/* @vite-ignore */ path),
      { defaultSettings } = await import(/* @vite-ignore */ typesPath),
      { defaultVisual } = await import(/* @vite-ignore */ visualPath),
      { imageBlendModes } = await import(/* @vite-ignore */ blendsPath),
      { defaultPainting } = await import(/* @vite-ignore */ paintPath);
    const engine = createBrowserEngine(),
      report = await engine.importFiles([
        new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], 'photo.png'),
      ]),
      asset = report.assets[0],
      failures: string[] = [];
    for (const mode of imageBlendModes) {
      try {
        const output = await engine.export(
          asset,
          {
            ...defaultSettings(asset),
            format: 'jpeg',
            painting: { ...defaultPainting(), image: 'data:image/png;base64,' + data },
            visual: { ...defaultVisual(), invert: 1 },
            imageLayers: {
              order: [],
              groups: [],
              entries: {
                'primary:painting': { blend: mode, opacity: 0.5 },
                'primary:invert': { blend: mode, opacity: 0.5 },
              },
            },
          },
          () => {},
        );
        if (!output.size) throw new Error('Empty output');
        URL.revokeObjectURL(output.url);
      } catch (error) {
        failures.push(mode + ': ' + (error as Error).message);
      }
    }
    await engine.release(asset);
    return failures;
  }, bytes.toString('base64'));
  expect(results).toEqual([]);
});

test('positions shape masks and paints independent selections in the browser', async ({
  page,
}, info) => {
  await page.goto('/');
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add media', exact: true }).click();
  await (await choosing).setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: bytes });
  await expect(page.getByLabel('Image canvas', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Add Exposure', exact: true }).click();
  await page.getByLabel('Exposure value', { exact: true }).fill('1');
  await page.getByLabel('Effect mask type', { exact: true }).selectOption('ellipse');
  const move = page.getByRole('button', { name: 'Move effect mask', exact: true }),
    box = (await move.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5 + 25, box.y + box.height * 0.5, { steps: 6 });
  await page.mouse.up();
  expect(Number(await page.getByLabel('Mask x', { exact: true }).inputValue())).toBeGreaterThan(20);
  await page.getByLabel('Layer blend mode', { exact: true }).selectOption('softlight');
  await page.getByLabel('Effect mask type', { exact: true }).selectOption('brush');
  const canvas = page.getByLabel('Paint effect mask', { exact: true }),
    paint = (await canvas.boundingBox())!;
  await page.mouse.move(paint.x + paint.width * 0.3, paint.y + paint.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(paint.x + paint.width * 0.7, paint.y + paint.height * 0.7, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Undo mask stroke', exact: true })).toBeEnabled();
  await page.screenshot({ path: info.outputPath('image-mask-editor.png') });
  await page.getByRole('button', { name: 'Close effect settings', exact: true }).click();
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Save file', exact: true })).toBeVisible({
    timeout: 45000,
  });
});

test('renames, hides, locks and groups independent image layers', async ({ page }) => {
  await page.goto('/');
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add media', exact: true }).click();
  await (await choosing).setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: bytes });
  await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeEnabled();
  for (const name of ['Exposure', 'Invert']) {
    await page.getByRole('button', { name: `Add ${name}`, exact: true }).click();
    await page.getByRole('button', { name: 'Close effect settings', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Rename Exposure layer 1', exact: true }).click();
  await page.getByLabel('Layer name', { exact: true }).fill('Warm light');
  await page.getByLabel('Layer name', { exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Lock Warm light layer 1', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Remove Exposure layer 1', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Unlock Warm light layer 1', exact: true }).click();
  await page.getByRole('button', { name: 'Hide Warm light layer 1', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Show Warm light layer 1', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Select Warm light layer 1', { exact: true }).check();
  await page.getByLabel('Select Invert layer 2', { exact: true }).check();
  await page.getByRole('button', { name: 'Group selected', exact: true }).click();
  await page.getByRole('button', { name: 'Lock Group 1', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Remove Invert layer 2', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Collapse Group 1', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Remove Invert layer 2', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand Group 1', exact: true }).click();
  await page.getByRole('button', { name: 'Unlock Group 1', exact: true }).click();
});

test('browser masks preserve source colors outside every selection type', async ({ page }) => {
  await page.goto('/');
  const failures = await page.evaluate(async (data) => {
    const enginePath = '/src/engines/browser.ts',
      typesPath = '/src/core/types.ts',
      visualPath = '/src/core/visual-settings.ts',
      masksPath = '/src/core/image-masks.ts';
    const { createBrowserEngine } = await import(/* @vite-ignore */ enginePath),
      { defaultSettings } = await import(/* @vite-ignore */ typesPath),
      { defaultVisual } = await import(/* @vite-ignore */ visualPath),
      { defaultImageMask } = await import(/* @vite-ignore */ masksPath),
      engine = createBrowserEngine();
    const file = new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], 'photo.png'),
      { assets } = await engine.importFiles([file]),
      asset = assets[0],
      canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(await createImageBitmap(file), 0, 0);
    const original = ctx.getImageData(0, 0, 320, 240).data;
    ctx.clearRect(0, 0, 320, 240);
    ctx.fillStyle = 'white';
    ctx.fillRect(64, 48, 192, 144);
    const brush = canvas.toDataURL('image/png'),
      failures: string[] = [];
    for (const mode of ['rectangle', 'ellipse', 'brush']) {
      try {
        const mask = { ...defaultImageMask(), mode, feather: 0 };
        mask.brush.image = brush;
        const output = await engine.export(
          asset,
          {
            ...defaultSettings(asset),
            visual: { ...defaultVisual(), exposure: 1 },
            imageLayers: { order: [], groups: [], entries: { 'primary:exposure': { mask } } },
          },
          () => {},
        );
        const bitmap = await createImageBitmap(await (await fetch(output.url)).blob());
        ctx.clearRect(0, 0, 320, 240);
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        const pixels = ctx.getImageData(0, 0, 320, 240).data;
        for (const x of [80, 240]) {
          const index = (24 * 320 + x) * 4;
          for (let channel = 0; channel < 4; channel++)
            if (Math.abs(original[index + channel] - pixels[index + channel]) > 3)
              throw new Error(
                `Outside pixel ${x}, channel ${channel}: ${original[index + channel]} → ${pixels[index + channel]}`,
              );
        }
        URL.revokeObjectURL(output.url);
      } catch (error) {
        failures.push(mode + ': ' + (error as Error).message);
      }
    }
    await engine.release(asset);
    return failures;
  }, bytes.toString('base64'));
  expect(failures).toEqual([]);
});

test('selecting a lower text layer keeps the exact idle composite visible', async ({ page }) => {
  await page.goto('/');
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add media', exact: true }).click();
  await (await choosing).setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: bytes });
  await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Add Text', exact: true }).click();
  await page.getByLabel('Text content', { exact: true }).fill('Layer below invert');
  await page.getByRole('button', { name: 'Close effect settings', exact: true }).click();
  await page.getByRole('button', { name: 'Add Invert', exact: true }).click();
  await page.getByRole('button', { name: 'Close effect settings', exact: true }).click();
  const frame = page.locator('.image-canvas-frame');
  await expect(frame).toHaveAttribute('aria-busy', 'false', { timeout: 45000 });
  const checksum = () =>
    page.locator('.image-canvas-frame>img').evaluate(async (image) => {
      const bitmap = await createImageBitmap(
          await (await fetch((image as HTMLImageElement).src)).blob(),
        ),
        canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let hash = 2166136261;
      for (const pixel of pixels) hash = Math.imul(hash ^ pixel, 16777619);
      return hash;
    });
  const before = await checksum();
  await page
    .getByLabel('Image layers', { exact: true })
    .locator('.image-layer-open')
    .filter({ hasText: 'Layer below invert' })
    .click();
  await expect(frame).toHaveAttribute('aria-busy', 'false', { timeout: 45000 });
  await expect(page.locator('.image-frame-layer[data-live]')).toHaveCount(0);
  expect(await checksum()).toBe(before);
});
