import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
let bytes: Buffer;
test.beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'frame-retouch-web-'));
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
        'color=0x503028:s=320x240,drawbox=x=0:y=0:w=160:h=240:color=0xd05030:t=fill',
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
test('clones, heals, undoes and exports a soft independent retouch layer', async ({
  page,
}, info) => {
  await page.goto('/');
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add media', exact: true }).click();
  await (await choosing).setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: bytes });
  await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Add Retouch', exact: true }).click();
  const canvas = page.getByLabel('Retouch image', { exact: true });
  await expect(canvas).toHaveAttribute('aria-busy', 'false', { timeout: 30000 });
  await page.getByLabel('Retouch brush size', { exact: true }).fill('0.15');
  await expect(page.locator('.image-canvas-frame')).toHaveAttribute('aria-busy', 'false', {
    timeout: 30000,
  });
  await expect(canvas).toHaveAttribute('aria-busy', 'false');
  const box = (await canvas.boundingBox())!;
  await page.keyboard.down('Alt');
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.5);
  await page.keyboard.up('Alt');
  await expect(page.getByLabel('Retouch source point', { exact: true })).toBeVisible();
  await expect(page.locator('.image-canvas-frame')).toHaveAttribute('aria-busy', 'false', {
    timeout: 30000,
  });
  await expect(canvas).toHaveAttribute('aria-busy', 'false');
  await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.82, box.y + box.height * 0.5, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.retouch-controls')).toContainText('1 strokes');
  await expect(canvas).toHaveAttribute('aria-busy', 'false', { timeout: 30000 });
  await expect(page.locator('.image-canvas-frame')).toHaveAttribute('aria-busy', 'false', {
    timeout: 30000,
  });
  await page.screenshot({ path: info.outputPath('retouch.png') });
  await page.getByRole('button', { name: 'Close effect settings', exact: true }).click();
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Save file', exact: true })).toBeVisible({
    timeout: 45000,
  });
  const pixel = await page
    .getByRole('link', { name: 'Save file', exact: true })
    .evaluate(async (el) => {
      const image = new Image();
      image.src = (el as HTMLAnchorElement).href;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return Array.from(context.getImageData(240, 120, 1, 1).data);
    });
  expect(pixel[0]).toBeGreaterThan(180);
  expect(pixel[3]).toBe(255);
  await page
    .getByLabel('Image layers', { exact: true })
    .locator('.image-layer-open')
    .filter({ hasText: 'Retouch' })
    .click();
  await expect(canvas).toHaveAttribute('aria-busy', 'false', { timeout: 30000 });
  await page.getByRole('button', { name: 'Undo retouch stroke', exact: true }).click();
  await expect(page.locator('.retouch-controls')).toContainText('0 strokes');
  await page.getByRole('button', { name: 'Heal', exact: true }).click();
  await expect(canvas).toHaveAttribute('aria-busy', 'false', { timeout: 30000 });
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.5);
  await expect(page.locator('.retouch-controls')).toContainText('1 strokes');
  await page.getByRole('button', { name: 'Clear retouch layer', exact: true }).click();
  await expect(page.locator('.retouch-controls')).toContainText('0 strokes');
});
