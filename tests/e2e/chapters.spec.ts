import { expect, test } from '@playwright/test';
import { readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ffprobePath } from '../../electron/native';
test('exports marker chapters with browser FFmpeg and downloads an output timestamp list', async ({ page }) => {
  test.setTimeout(90000); await page.goto('/'); await page.getByRole('button', { name: 'Try a sample', exact: true }).click();
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4, { timeout: 30000 });
  for (const [time, name] of [[1, 'Intro'], [3, 'Second scene']] as const) {
    await page.getByLabel('Seek playhead').fill(String(time)); await page.getByRole('button', { name: 'Add timeline marker', exact: true }).click(); await page.getByLabel('Marker name', { exact: true }).fill(name); await page.getByRole('button', { name: 'Save marker', exact: true }).click(); await page.getByRole('button', { name: 'Close markers', exact: true }).click();
  }
  await page.getByRole('button', { name: '2 markers', exact: true }).click(); const listDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download chapter list', exact: true }).click(); expect(await readFile((await (await listDownload).path())!, 'utf8')).toBe('00:00:00.000 Opening\n00:00:01.000 Intro\n00:00:03.000 Second scene\n'); await page.getByRole('button', { name: 'Close markers', exact: true }).click();
  await page.getByRole('tab', { name: 'Export', exact: true }).click(); await page.getByText('Advanced settings', { exact: true }).click(); await page.getByLabel('Include chapters from markers').check();
  await page.getByRole('button', { name: 'Export MP4', exact: true }).click(); const file = page.waitForEvent('download'); await page.getByRole('link', { name: 'Save file', exact: true }).click(); const path = (await (await file).path())!;
  const { stdout } = await promisify(execFile)(ffprobePath(), ['-v', 'error', '-show_chapters', '-of', 'json', path]); const chapters = JSON.parse(stdout).chapters; expect(chapters.map((chapter: { tags: { title: string }; start_time: string }) => [chapter.tags.title, Number(chapter.start_time)])).toEqual([['Opening', 0], ['Intro', 1], ['Second scene', 3]]);
  await page.getByLabel('Output format', { exact: true }).selectOption('wav'); await expect(page.getByLabel('Include chapters from markers')).toBeDisabled(); await rm(path, { force: true });
});
