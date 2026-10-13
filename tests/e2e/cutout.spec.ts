import { expect, test } from '@playwright/test';
import { encodePixelsPng } from '../../src/core/png-encoding';
const pixels = new Uint8ClampedArray(160 * 120 * 4);
for (let y = 0; y < 120; y++)
  for (let x = 0; x < 160; x++)
    pixels.set(
      x >= 40 && x < 120 && y >= 30 && y < 90 ? [50, 170, 90, 255] : [235, 235, 235, 255],
      (y * 160 + x) * 4,
    );
const bytes = Buffer.from(encodePixelsPng(160, 120, pixels));
test('removes an image background automatically, refines it and exports transparency', async ({
  page,
}, info) => {
  await page.goto('/');
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add media', exact: true }).click();
  await (await choosing).setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: bytes });
  await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Add Remove background', exact: true }).click();
  const canvas = page.getByLabel('Refine image background', { exact: true });
  await expect(canvas).toHaveAttribute('aria-busy', 'false', { timeout: 30000 });
  await expect(page.locator('.image-canvas-frame')).toHaveAttribute('aria-busy', 'false', {
    timeout: 30000,
  });
  const read = async () =>
    page.locator('.image-canvas-frame>img').evaluate((el) => {
      const image = el as HTMLImageElement,
        canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const c = canvas.getContext('2d')!;
      c.drawImage(image, 0, 0);
      return {
        outside: Array.from(c.getImageData(10, 10, 1, 1).data),
        inside: Array.from(c.getImageData(80, 60, 1, 1).data),
      };
    });
  await expect.poll(async () => (await read()).outside[3], { timeout: 30000 }).toBe(0);
  expect((await read()).inside[3]).toBe(255);
  await page.getByRole('button', { name: 'Restore area', exact: true }).click();
  await page.getByLabel('Background refinement brush size', { exact: true }).fill('0.2');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.1, box.y + box.height * 0.1);
  await expect(page.locator('.cutout-controls')).toContainText('1 refinements');
  await expect(canvas).toHaveAttribute('aria-busy', 'false', { timeout: 30000 });
  await page.getByRole('button', { name: 'Undo mask stroke', exact: true }).click();
  await expect(page.locator('.cutout-controls')).toContainText('0 refinements');
  await expect(canvas).toHaveAttribute('aria-busy', 'false', { timeout: 30000 });
  await page.screenshot({ path: info.outputPath('background-removal.png') });
  await page.getByRole('button', { name: 'Close effect settings', exact: true }).click();
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Save file', exact: true })).toBeVisible({
    timeout: 45000,
  });
  const alpha = await page
    .getByRole('link', { name: 'Save file', exact: true })
    .evaluate(async (el) => {
      const image = new Image();
      image.src = (el as HTMLAnchorElement).href;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const c = canvas.getContext('2d')!;
      c.drawImage(image, 0, 0);
      return [c.getImageData(10, 10, 1, 1).data[3], c.getImageData(80, 60, 1, 1).data[3]];
    });
  expect(alpha).toEqual([0, 255]);
});
