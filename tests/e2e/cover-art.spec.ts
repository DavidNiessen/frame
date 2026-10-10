import { expect, test } from '@playwright/test';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { conversionLibrary, probeConversion } from '../helpers/conversion-library';
import { unzipSync } from 'fflate';
import { ffmpegPath } from '../../electron/native';
test('adds resized artwork to browser audio exports and saves it with a project', async ({ page }, info) => {
  const library = await conversionLibrary(), image = join(library.directory, 'artwork.jpg');
  try {
    await promisify(execFile)(ffmpegPath(), ['-y', '-f', 'lavfi', '-i', 'color=c=purple:s=1800x1400', '-frames:v', '1', '-threads', '1', image]);
    await page.goto('/'); await page.getByLabel('Choose media files', { exact: true }).setInputFiles(library.sources[0]); await expect(page.locator('.asset-list li')).toHaveCount(1, { timeout: 30000 }); await page.getByRole('tab', { name: 'Export', exact: true }).click(); await page.getByText('Advanced settings', { exact: true }).click(); await page.getByLabel('Choose cover artwork', { exact: true }).setInputFiles(image); await expect(page.getByAltText('Custom cover artwork', { exact: true })).toBeVisible(); await expect(page.getByLabel('Include artwork', { exact: true })).toBeChecked();
    await page.getByRole('button', { name: 'Export MP3', exact: true }).click(); const pending = page.waitForEvent('download'); await page.getByRole('link', { name: 'Save file', exact: true }).click(); const output = info.outputPath('covered.mp3'); await (await pending).saveAs(output); const streams = (await probeConversion(output)).streams; const cover = streams.find((stream: { disposition?: { attached_pic: number } }) => stream.disposition?.attached_pic === 1); expect(cover.width).toBe(1200); expect(cover.height).toBeLessThanOrEqual(1200);
    const saved = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save project', exact: true }).click(); const path = (await (await saved).path())!, project = JSON.parse(await readFile(path, 'utf8')); expect(project.sources[0].edit.customArtwork).toMatch(/^data:image\/png;base64,/); await page.getByRole('button', { name: 'Remove custom cover artwork', exact: true }).click(); await expect(page.getByAltText('Custom cover artwork')).toHaveCount(0); await page.getByLabel('Choose project file', { exact: true }).setInputFiles(path); await page.getByRole('button', { name: 'Restore edits', exact: true }).click(); await expect(page.getByAltText('Custom cover artwork')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 }); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await rm(library.directory, { recursive: true, force: true }); }
});

test('uses one custom cover for every browser bulk conversion', async ({ page }, info) => {
  const library = await conversionLibrary(), image = join(library.directory, 'cover.png');
  try {
    await promisify(execFile)(ffmpegPath(), ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64', '-frames:v', '1', '-threads', '1', image]);
    await page.goto('/'); await page.getByRole('navigation', { name: 'Workflow' }).getByRole('button', { name: 'Convert', exact: true }).click(); await page.getByLabel('Choose media folder').setInputFiles(library.root); await expect(page.locator('.conversion-table tbody tr')).toHaveCount(2, { timeout: 30000 }); await page.getByText('Advanced options', { exact: true }).click(); await page.getByLabel('Choose cover artwork', { exact: true }).setInputFiles(image); await expect(page.getByAltText('Custom cover artwork')).toBeVisible(); await page.getByRole('button', { name: 'Convert 2 files', exact: true }).click(); const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download all (ZIP)', exact: true }).click(); const files = unzipSync(await readFile((await (await pending).path())!)), outputs = Object.keys(files).filter(name => name.endsWith('.mp3')); expect(outputs).toHaveLength(2);
    for (const [index, name] of outputs.entries()) { const path = info.outputPath(`song-${index}.mp3`); await writeFile(path, files[name]); expect((await probeConversion(path)).streams.some((stream: { disposition?: { attached_pic: number } }) => stream.disposition?.attached_pic === 1)).toBe(true); }
  } finally { await rm(library.directory, { recursive: true, force: true }); }
});
