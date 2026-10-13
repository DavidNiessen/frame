import { expect, test } from '@playwright/test';
import { movingSubjectFrames } from '../helpers/moving-subject';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegPath } from '../../electron/native';
test('tracks a selected subject locally and exposes editable animation in the browser', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const dir = await mkdtemp(join(tmpdir(), 'frame-motion-web-'));
  try {
    const raw = join(dir, 'frames.raw'),
      video = join(dir, 'moving.mp4');
    await writeFile(raw, movingSubjectFrames());
    await promisify(execFile)(ffmpegPath(), [
      '-v',
      'error',
      '-y',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'gray',
      '-s',
      '160x90',
      '-r',
      '8',
      '-i',
      raw,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      video,
    ]);
    await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
    await page.goto('/');
    await expect(page.getByLabel('Autosave status')).toHaveText(/ready|saved|disabled/i);
    const buffer = await readFile(video);
    await page
      .getByLabel('Choose media files', { exact: true })
      .setInputFiles(
        ['Base.mp4', 'Overlay.mp4'].map((name) => ({ name, mimeType: 'video/mp4', buffer })),
      );
    await page
      .getByRole('button', { name: 'Layer Overlay.mp4 over current media', exact: true })
      .click();
    await page.getByText('Motion tracking', { exact: true }).click();
    await page.getByRole('button', { name: 'Prepare tracking frames', exact: true }).click();
    const canvas = page.getByLabel('Select a subject to track');
    await expect(canvas).toBeVisible({ timeout: 60000 });
    await canvas.scrollIntoViewIfNeeded();
    const bounds = (await canvas.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width * 0.125, bounds.y + (bounds.height * 2) / 9);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.25, bounds.y + (bounds.height * 4) / 9, {
      steps: 8,
    });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Track subject', exact: true }).click();
    await expect(
      page.getByText('Motion applied. Review or refine the X/Y keyframes above.', { exact: true }),
    ).toBeVisible({ timeout: 60000 });
    await expect(
      page.getByRole('switch', { name: 'Animate x position', exact: true }),
    ).toBeChecked();
    await expect(page.locator('.timeline-keyframe-dot')).toHaveCount(2);
    await page.screenshot({ path: info.outputPath('motion-tracking.png') });
    await page.getByRole('button', { name: 'Close media layer settings', exact: true }).click();
    await page.getByRole('button', { name: 'Export MP4', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Save file', exact: true })).toBeVisible({
      timeout: 60000,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
