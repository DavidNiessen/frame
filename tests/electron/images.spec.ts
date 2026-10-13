import { expect, test, _electron } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
test('edits a TIFF in the desktop canvas and exports an image with bundled tools', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-image-desktop-')),
    input = join(directory, 'photo.tiff'),
    output = join(directory, 'photo.png');
  execFileSync(
    resolve('build/media-tools', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
    ['-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240', '-frames:v', '1', '-threads', '1', input],
  );
  const app = await _electron.launch({
    args: [
      `--user-data-dir=${join(directory, 'profile')}`,
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
    await expect(page.getByLabel('Image canvas', { exact: true })).toBeVisible();
    await expect(page.locator('video')).toHaveCount(0);
    const before = page.getByRole('button', { name: 'Before / after', exact: true });
    await expect(before).toBeEnabled({ timeout: 30000 });
    await before.click();
    await expect(page.locator('.image-canvas-frame>img')).toHaveJSProperty('naturalWidth', 320);
    await page.getByRole('button', { name: 'Original', exact: true }).click();
    await page.getByRole('button', { name: 'Add Vignette', exact: true }).click();
    await page.getByLabel('Vignette value').fill('0.8');
    await page.getByRole('button', { name: 'Close effect settings', exact: true }).click();
    await expect(page.getByLabel('Image layers')).toContainText('Vignette');
    await page.getByRole('button', { name: 'Add Painting', exact: true }).click();
    const canvas = page.getByLabel('Paint on frame', { exact: true }),
      bounds = (await canvas.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.8, bounds.y + bounds.height * 0.7, {
      steps: 12,
    });
    await page.mouse.up();
    await expect(page.getByRole('button', { name: 'Undo stroke', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Close effect settings', exact: true }).click();
    await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Export PNG', exact: true })).toBeEnabled({
      timeout: 30000,
    });
    expect((await stat(output)).size).toBeGreaterThan(100);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
