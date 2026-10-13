import { test, expect, _electron } from '@playwright/test';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
test('desktop edits independent video and linked audio tracks and exports them locally', async () => {
  test.setTimeout(90000);
  const dir = await mkdtemp(join(tmpdir(), 'frame-tracks-desktop-')),
    output = join(dir, 'layers.mp4'),
    app = await _electron.launch({
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
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths.inputs });
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: paths.output });
      },
      {
        inputs: [resolve('tests/fixtures/sample.mp4'), resolve('tests/fixtures/sample.mp4')],
        output,
      },
    );
    await page.getByRole('button', { name: 'Add media', exact: true }).click();
    await expect(page.locator('.asset-list li')).toHaveCount(2);
    await page
      .getByRole('button', { name: 'Layer sample.mp4 over current media', exact: true })
      .click();
    await page.getByLabel('Media layer width', { exact: true }).fill('60');
    await page.getByRole('button', { name: 'Close media layer settings', exact: true }).click();
    await expect(page.locator('video')).toHaveAttribute('data-preview-effects', 'rendered', {
      timeout: 30000,
    });
    await expect(page.locator('.visual-media-bar')).toHaveCount(1);
    await expect(page.locator('.audio-layer-bar')).toHaveCount(1);
    await page.getByRole('button', { name: 'Export MP4', exact: true }).click();
    await expect
      .poll(
        async () =>
          stat(output)
            .then((s) => s.size)
            .catch(() => 0),
        { timeout: 45000 },
      )
      .toBeGreaterThan(1000);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
