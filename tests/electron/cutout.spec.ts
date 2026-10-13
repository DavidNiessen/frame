import { expect, test, _electron } from '@playwright/test';
import { mkdtemp, writeFile, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { encodePixelsPng } from '../../src/core/png-encoding';
test('desktop removes a plain image background locally and exports transparent PNG', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'frame-cutout-desktop-')),
    input = join(dir, 'photo.png'),
    output = join(dir, 'cutout.png'),
    pixels = new Uint8ClampedArray(160 * 120 * 4);
  for (let y = 0; y < 120; y++)
    for (let x = 0; x < 160; x++)
      pixels.set(
        x >= 40 && x < 120 && y >= 30 && y < 90 ? [50, 170, 90, 255] : [235, 235, 235, 255],
        (y * 160 + x) * 4,
      );
  await writeFile(input, encodePixelsPng(160, 120, pixels));
  const app = await _electron.launch({
    args: [
      `--user-data-dir=${join(dir, 'profile')}`,
      ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []),
      '.',
    ],
    env: { ...process.env, PATH: '', FRAME_DEV_URL: '' },
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeEnabled();
    await app.evaluate(
      ({ dialog }, paths) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paths.input] });
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: paths.output });
      },
      { input, output },
    );
    await page.getByRole('button', { name: 'Add media', exact: true }).click();
    await page.getByRole('button', { name: 'Add Remove background', exact: true }).click();
    await expect(page.getByLabel('Refine image background', { exact: true })).toHaveAttribute(
      'aria-busy',
      'false',
      { timeout: 30000 },
    );
    await expect
      .poll(
        async () =>
          page.locator('.image-canvas-frame>img').evaluate((el) => {
            const img = el as HTMLImageElement;
            if (!img.complete || !img.naturalWidth) return -1;
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const c = canvas.getContext('2d')!;
            c.drawImage(img, 0, 0);
            return c.getImageData(10, 10, 1, 1).data[3];
          }),
        { timeout: 30000 },
      )
      .toBe(0);
    await page.getByRole('button', { name: 'Close effect settings', exact: true }).click();
    await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
    await expect
      .poll(
        async () =>
          stat(output)
            .then((s) => s.size)
            .catch(() => 0),
        { timeout: 30000 },
      )
      .toBeGreaterThan(100);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
