import { closeEffect, openEffect } from '../helpers/effects';
import { trim } from '../helpers/timeline';
import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffprobe from '@ffprobe-installer/ffprobe';
const exec = promisify(execFile);
test('exports rotated resized browser video', async ({ page }, info) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample' }).click(); await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click(); await trim(page, 'end', 1);
  await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click(); await openEffect(page, 'Rotate, flip & resize'); await page.getByLabel('Video rotation').selectOption('90'); await page.getByRole('button', { name: 'Flip horizontally', exact: true }).click();
  await page.getByLabel('Resize preset').selectOption('custom'); await page.getByLabel('Lock aspect ratio', { exact: true }).uncheck(); await page.getByLabel('Resize width').fill('180'); await page.getByLabel('Resize height').fill('320');
  await closeEffect(page); await page.getByRole('button', { name: 'Export MP4', exact: true }).click(); await expect(page.getByRole('link', { name: 'Save file' })).toBeVisible({ timeout: 45000 });
  const pending = page.waitForEvent('download'); await page.getByRole('link', { name: 'Save file' }).click(); const output = info.outputPath('resized.mp4'); await (await pending).saveAs(output);
  const { stdout } = await exec(ffprobe.path, ['-v', 'error', '-show_streams', '-of', 'json', output]); const video = JSON.parse(stdout).streams.find((s: { codec_type: string }) => s.codec_type === 'video'); expect([video.width, video.height]).toEqual([180, 320]);
});
