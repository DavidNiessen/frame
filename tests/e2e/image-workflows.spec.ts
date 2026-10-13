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
