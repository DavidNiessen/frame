import { expect, test } from '@playwright/test';
import { encodePixelsPng } from '../../src/core/png-encoding';

test('reuses image backgrounds, undo/redo renders and zoom without redundant encoding', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('frame:workspace-autosave', 'false');
    Reflect.set(window, 'imagePreviewRenders', 0);
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (
      this: Worker,
      message: unknown,
      options?: Transferable[] | StructuredSerializeOptions,
    ) {
      const packet = message as { type?: string; data?: { args?: string[] } };
      if (packet.type === 'EXEC' && packet.data?.args?.at(-1) === 'joined.png')
        Reflect.set(window, 'imagePreviewRenders', Reflect.get(window, 'imagePreviewRenders') + 1);
      Reflect.apply(post, this, [message, options ?? []]);
    };
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeEnabled();
  const pixels = new Uint8ClampedArray(160 * 120 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([50, 100, 180, 255], i);
  await page.getByLabel('Choose media files', { exact: true }).setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(encodePixelsPng(160, 120, pixels)),
  });
  const frame = page.locator('.image-canvas-frame'),
    image = frame.locator('img[alt="photo.png"]');
  const renders = () => page.evaluate(() => Number(Reflect.get(window, 'imagePreviewRenders')));
  await expect(frame).toHaveAttribute('aria-busy', 'false', { timeout: 30000 });
  expect(await renders()).toBe(1);
  await page.getByRole('button', { name: 'Add Text', exact: true }).click();
  await page.getByLabel('Text content', { exact: true }).fill('First');
  await expect(frame).toHaveAttribute('aria-busy', 'false', { timeout: 30000 });
  const first = await image.getAttribute('src'),
    beforeChange = await renders();
  await page.getByLabel('Text content', { exact: true }).fill('Second');
  await expect(frame).toHaveAttribute('aria-busy', 'false', { timeout: 30000 });
  expect(await renders()).toBe(beforeChange + 1);
  const second = await image.getAttribute('src'),
    beforeUndo = await renders();
  expect(second).not.toBe(first);
  await page.getByRole('button', { name: 'Undo image edit', exact: true }).click();
  await expect(image).toHaveAttribute('src', first!, { timeout: 2000 });
  await page.getByRole('button', { name: 'Redo image edit', exact: true }).click();
  await expect(image).toHaveAttribute('src', second!, { timeout: 2000 });
  expect(await renders()).toBe(beforeUndo);
  await page.getByRole('button', { name: 'Zoom in image', exact: true }).click();
  await expect(frame).toHaveAttribute('aria-busy', 'false');
  await expect(image).toHaveAttribute('src', second!);
  expect(await renders()).toBe(beforeUndo);
});
