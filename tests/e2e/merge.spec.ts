import { trim } from '../helpers/timeline';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffprobe from '@ffprobe-installer/ffprobe';
const exec = promisify(execFile);
test('reorders and merges edited source clips in the browser', async ({ page }, testInfo) => {
  await page.goto('/');
  const buffer = await readFile('tests/fixtures/sample.mp4');
  await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeEnabled();
  await page
    .getByLabel('Choose media files')
    .setInputFiles(['one.mp4', 'two.mp4'].map((name) => ({ name, mimeType: 'video/mp4', buffer })));
  await page.getByRole('tab', { name: 'Effects', exact: true }).click();
  await trim(page, 'end', 0.5);
  await page.locator('.asset-select').filter({ hasText: 'two.mp4' }).click();
  await page.getByRole('tab', { name: 'Effects', exact: true }).click();
  await trim(page, 'end', 0.5);
  await page.getByLabel('Project tools', { exact: true }).click();
  await page.getByRole('button', { name: 'Merge clips', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Merge clips', exact: true });
  await dialog.getByRole('button', { name: 'Move clip 2 up' }).click();
  await expect(dialog.locator('li').first()).toContainText('two.mp4');
  await dialog.getByRole('button', { name: 'Export merged file' }).click();
  await expect(dialog.getByRole('link', { name: 'Save merged file' })).toBeVisible({
    timeout: 45000,
  });
  const pending = page.waitForEvent('download');
  await dialog.getByRole('link', { name: 'Save merged file' }).click();
  const output = testInfo.outputPath('merged.mp4');
  await (await pending).saveAs(output);
  const { stdout } = await exec(ffprobe.path, [
    '-v',
    'error',
    '-show_format',
    '-of',
    'json',
    output,
  ]);
  expect(Number(JSON.parse(stdout).format.duration)).toBeCloseTo(1, 1);
  await dialog.getByLabel('Merge format', { exact: true }).selectOption('gif');
  await dialog.getByRole('button', { name: 'Export merged file' }).click();
  await expect(
    dialog.getByRole('link', { name: 'Save merged file' }).or(dialog.getByRole('alert')).first(),
  ).toBeVisible({ timeout: 45000 });
  expect(await dialog.getByRole('alert').allTextContents()).toEqual([]);
  await expect(dialog.getByRole('link', { name: 'Save merged file' })).toBeVisible({
    timeout: 45000,
  });
  const gifPending = page.waitForEvent('download');
  await dialog.getByRole('link', { name: 'Save merged file' }).click();
  const gif = testInfo.outputPath('merged.gif');
  await (await gifPending).saveAs(gif);
  const { stdout: gifInfo } = await exec(ffprobe.path, [
    '-v',
    'error',
    '-show_streams',
    '-show_format',
    '-of',
    'json',
    gif,
  ]);
  expect(JSON.parse(gifInfo).streams[0].codec_name).toBe('gif');
  expect(Number(JSON.parse(gifInfo).format.duration)).toBeCloseTo(1, 1);
});
