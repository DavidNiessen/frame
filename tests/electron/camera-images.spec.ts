import { expect, test, _electron } from '@playwright/test';
import { mkdtemp, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cameraDng, cameraHeic } from '../helpers/camera-images';
test('desktop imports camera images, exports with portable tools and recovers from the originals', async () => {
  test.setTimeout(120000);
  const dir = await mkdtemp(join(tmpdir(), 'frame-camera-desktop-')),
    dng = join(dir, 'camera.dng'),
    heic = join(dir, 'phone.heic'),
    output = join(dir, 'photo.png');
  await writeFile(dng, cameraDng());
  await writeFile(heic, await cameraHeic(dir));
  const profile = join(dir, 'profile'),
    env = { ...process.env, PATH: '', FRAME_DEV_URL: '' },
    args = [
      `--user-data-dir=${profile}`,
      ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []),
      '.',
    ];
  let app = await _electron.launch({ args, env });
  try {
    let page = await app.firstWindow();
    await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeEnabled();
    await app.evaluate(
      ({ dialog }, paths) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths.inputs });
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: paths.output });
      },
      { inputs: [dng, heic], output },
    );
    await page.getByRole('button', { name: 'Add media', exact: true }).click();
    await expect(page.getByLabel('Image canvas', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /camera\.dng 64 × 48/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /phone\.heic 64 × 48/ })).toBeVisible();
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
    await expect(page.locator('.app-footer')).toContainText(/saved|ready/i, { timeout: 15000 });
    await app.close();
    app = await _electron.launch({ args, env });
    page = await app.firstWindow();
    await expect(page.getByRole('button', { name: /camera\.dng 64 × 48/ })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByRole('button', { name: /phone\.heic 64 × 48/ })).toBeVisible();
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
