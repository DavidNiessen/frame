import { importTestMedia } from '../helpers/import-media';
import { closeEffect, openEffect } from '../helpers/effects';
import { trim } from '../helpers/timeline';
import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffprobe from '@ffprobe-installer/ffprobe';
const exec = promisify(execFile);
test('previews and exports speed edits with undo support', async ({ page }, testInfo) => {
  await page.goto('/');
  await importTestMedia(page);
  await closeEffect(page);
  await page.getByRole('tab', { name: 'Effects', exact: true }).click();
  await openEffect(page, 'Speed');
  await page.getByLabel('Playback speed').selectOption('2');
  await expect(page.locator('video')).toHaveJSProperty('playbackRate', 2);
  await expect(page.locator('video')).toHaveJSProperty('preservesPitch', true);
  await page.getByLabel('Audio pitch').selectOption('follow');
  await expect(page.locator('video')).toHaveJSProperty('preservesPitch', false);
  await page.getByRole('button', { name: 'Undo edit' }).click();
  await openEffect(page, 'Speed');
  await expect(page.getByLabel('Audio pitch')).toHaveValue('preserve');
  await closeEffect(page);
  await page.getByRole('tab', { name: 'Effects', exact: true }).click();
  await trim(page, 'end', 1);
  await closeEffect(page);
  await page.getByRole('button', { name: 'Export MP4', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Save file' })).toBeVisible({ timeout: 45000 });
  const pending = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Save file' }).click();
  const output = testInfo.outputPath('fast.mp4');
  await (await pending).saveAs(output);
  const { stdout } = await exec(ffprobe.path, [
    '-v',
    'error',
    '-show_format',
    '-of',
    'json',
    output,
  ]);
  expect(Number(JSON.parse(stdout).format.duration)).toBeCloseTo(0.5, 1);
});
