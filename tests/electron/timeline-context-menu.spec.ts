import { expect, test, _electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { importTestMedia } from '../helpers/import-media';
import { closeEffect } from '../helpers/effects';
const require = createRequire(resolve('package.json'));
test('duplicates native footage and independent effects, then exports the complete sequence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-timeline-menu-')),
    executablePath = process.env.FRAME_TEST_EXECUTABLE;
  const app = await _electron.launch({
    executablePath: executablePath ? resolve(executablePath) : undefined,
    args: [
      `--user-data-dir=${join(directory, 'profile')}`,
      ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []),
      ...(executablePath ? [] : ['.']),
    ],
    env: { ...process.env, PATH: '', FRAME_DEV_URL: '' },
  });
  try {
    const page = await app.firstWindow();
    await importTestMedia(page, app);
    await page.locator('.timeline-clip .range-body').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
    await expect(page.locator('.timeline-clip')).toHaveCount(2);
    await expect(page.locator('.timeline-summary strong')).toContainText('0:12.0');
    const video = page.locator('video');
    await expect(video).toHaveAttribute('data-preview-clock', 'sequence', { timeout: 30000 });
    const body = page.locator('.timeline-clip .range-body').last(),
      box = (await body.boundingBox())!;
    await body.click({ button: 'right', position: { x: box.width / 2, y: box.height / 2 } });
    await page.getByRole('menuitem', { name: 'Move playhead here' }).click();
    await expect
      .poll(() => video.evaluate((v) => (v as HTMLVideoElement).currentTime))
      .toBeCloseTo(9, 1);
    // Move within the second occurrence without another explicit timeline seek.
    await body.click({ button: 'right', position: { x: box.width * 0.1, y: box.height / 2 } });
    await page.getByRole('menuitem', { name: 'Move playhead here' }).click();
    await video.evaluate((v) => {
      (v as HTMLVideoElement).currentTime = 10;
    });
    await expect(page.getByLabel('Seek playhead')).toHaveValue('4');
    await page.getByRole('button', { name: 'Add Volume', exact: true }).click();
    await page.getByRole('button', { name: 'Volume effect', exact: true }).click();
    await video.evaluate((v) => {
      (v as HTMLVideoElement).currentTime = 10;
    });
    await expect(page.getByLabel('Seek playhead')).toHaveValue('4');
    await page.getByLabel('Volume', { exact: true }).fill('1.5');
    await closeEffect(page);
    await expect(video).toHaveAttribute('data-preview-effects', 'rendered', { timeout: 20000 });
    await expect(video).not.toHaveAttribute('data-preview-preparing', 'true', { timeout: 20000 });
    await expect
      .poll(() => video.evaluate((v) => (v as HTMLVideoElement).currentTime))
      .toBeCloseTo(10, 1);
    await page
      .getByRole('button', { name: 'Volume effect', exact: true })
      .click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
    await expect(page.getByLabel('Volume', { exact: true })).toHaveValue('1.5');
    await page.getByLabel('Volume', { exact: true }).fill('0.8');
    await closeEffect(page);
    await page.getByRole('button', { name: 'Volume effect', exact: true }).click();
    await expect(page.getByLabel('Volume', { exact: true })).toHaveValue('1.5');
    await closeEffect(page);
    const destination = join(directory, 'duplicated.mp4');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, destination);
    await page.getByRole('button', { name: 'Export MP4', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Export MP4', exact: true })).toBeEnabled({
      timeout: 30000,
    });
    const probe = require('@ffprobe-installer/ffprobe').path;
    await expect
      .poll(() => {
        try {
          return Number(
            execFileSync(
              probe,
              [
                '-v',
                'error',
                '-show_entries',
                'format=duration',
                '-of',
                'default=noprint_wrappers=1:nokey=1',
                destination,
              ],
              { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
            ),
          );
        } catch {
          return 0;
        }
      })
      .toBeCloseTo(12, 1);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
