import { importTestMedia } from '../helpers/import-media';
import { closeEffect, openEffect } from '../helpers/effects';
import { trim } from '../helpers/timeline';
import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffprobe from '@ffprobe-installer/ffprobe';
const exec = promisify(execFile);
test('previews and exports browser audio cleanup', async ({ page }, testInfo) => {
  await page.goto('/'); await importTestMedia(page);
  await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click(); await trim(page, 'end', 1);
  await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click(); await openEffect(page, 'Normalize loudness');

  await openEffect(page, 'Noise reduction');
  await openEffect(page, 'Equalizer'); await page.getByLabel('Equalizer mid', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Preview audio effects', exact: true }).click();
  const audio = page.getByLabel('Processed audio preview', { exact: true });
  await expect(audio).toHaveJSProperty('readyState', 4, { timeout: 45000 });
  await closeEffect(page); await page.getByLabel('Output format').selectOption('wav');
  await closeEffect(page); await page.getByRole('button', { name: 'Export WAV', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Save file' })).toBeVisible({ timeout: 45000 });
  const pending = page.waitForEvent('download'); await page.getByRole('link', { name: 'Save file' }).click();
  const output = testInfo.outputPath('cleaned.wav'); await (await pending).saveAs(output);
  const { stdout } = await exec(ffprobe.path, ['-v', 'error', '-show_format', '-of', 'json', output]); expect(Number(JSON.parse(stdout).format.duration)).toBeCloseTo(1, 1);
});
