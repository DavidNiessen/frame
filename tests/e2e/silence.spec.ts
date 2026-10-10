import { closeEffect, openEffect } from '../helpers/effects';
import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ffmpegPath } from '../../electron/native';
import ffprobe from '@ffprobe-installer/ffprobe';
const ffmpeg = ffmpegPath();
const exec = promisify(execFile);
test('reviews browser silence cuts and exports the retained audio', async ({ page }, info) => {
  const input = info.outputPath('quiet.wav'); await exec(ffmpeg!, ['-y', '-f', 'lavfi', '-i', "aevalsrc=if(between(t\\,1\\,2)\\,0\\,0.1*sin(2*PI*440*t)):d=3:s=48000", input]);
  await page.goto('/'); await page.getByLabel('Choose media files').setInputFiles(input); await expect(page.getByLabel('Trim end')).toHaveAttribute('aria-valuenow', '3', { timeout: 45000 });
  await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click(); await openEffect(page, 'Remove silence'); await page.getByRole('button', { name: 'Find silent sections' }).click(); await expect(page.getByLabel('Remove silent section 1')).toBeVisible({ timeout: 45000 });
  await page.getByLabel('Remove silent section 1').uncheck(); await expect(page.getByRole('button', { name: 'Apply selected silence cuts' })).toBeDisabled();
  await page.getByLabel('Remove silent section 1').check(); await page.getByRole('button', { name: 'Apply selected silence cuts' }).click();
  await closeEffect(page); await page.getByLabel('Output format').selectOption('wav'); await closeEffect(page); await page.getByRole('button', { name: 'Export WAV', exact: true }).click(); await expect(page.getByRole('link', { name: 'Save file' })).toBeVisible({ timeout: 45000 });
  const pending = page.waitForEvent('download'); await page.getByRole('link', { name: 'Save file' }).click(); const output = info.outputPath('cut.wav'); await (await pending).saveAs(output);
  const { stdout } = await exec(ffprobe.path, ['-v', 'error', '-show_format', '-of', 'json', output]); expect(Number(JSON.parse(stdout).format.duration)).toBeCloseTo(2.2, 1);
});
