import { expect, test } from '@playwright/test';
import { readFile, rm } from 'node:fs/promises';
import { conversionLibrary, probeConversion } from '../helpers/conversion-library';
import { openEffect } from '../helpers/effects';
test('mixes music with video, moves and trims tracks, and restores their sources from a project', async ({ page }, info) => {
  const library = await conversionLibrary();
  try {
    await page.goto('/'); await page.getByRole('button', { name: 'Try a sample', exact: true }).click(); await expect(page.locator('.asset-list li')).toHaveCount(1); await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeEnabled();
    await page.locator('input[type="file"]').first().setInputFiles(library.sources[0]); await expect(page.locator('.asset-list li')).toHaveCount(2); await page.getByRole('button', { name: /^Studio study.mp4/ }).click();
    await page.getByRole('tab', { name: 'Effects', exact: true }).click(); await openEffect(page, 'Music & voiceover'); await page.getByLabel('Audio track source', { exact: true }).selectOption({ label: 'Song.wav' }); await page.getByRole('button', { name: 'Add audio track', exact: true }).click();
    await page.getByLabel('Track 1 volume', { exact: true }).fill('0.3'); await page.getByLabel('Loop track 1', { exact: true }).check(); await page.getByLabel('Track 1 fade in', { exact: true }).fill('0.2');
    // The compact timeline group can be opened independently of the inspector.
    const group = page.locator('.timeline-lane-group').filter({ hasText: 'Music & voiceover' }); if (!await group.evaluate(node => (node as HTMLDetailsElement).open)) await group.locator('summary').click();
    const bar = page.getByRole('button', { name: 'Audio track 1: Song.wav', exact: true }); await expect(bar).toBeVisible(); await expect(page.locator('.audio-layer-lane .audio-waveform')).toBeVisible({ timeout: 45000 }); await bar.press('Alt+ArrowRight'); await expect(page.getByRole('slider', { name: 'Audio track 1: Song.wav start', exact: true })).toHaveAttribute('aria-valuenow', '0.01');
    await page.getByRole('slider', { name: 'Audio track 1: Song.wav end', exact: true }).press('ArrowRight');
    await page.getByRole('button', { name: 'Remove Song.wav', exact: true }).click(); await expect(page.locator('.asset-list li')).toHaveCount(2); await expect(page.getByText('Remove this source’s music or voiceover tracks before removing it from the library.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Measure edited loudness', exact: true }).click(); await expect(page.getByLabel('Edited audio loudness')).toContainText('LUFS', { timeout: 45000 });
    await page.getByRole('button', { name: 'Play', exact: true }).click(); await expect(page.locator('audio[data-frame-mix-layer]')).toHaveJSProperty('paused', false); await page.getByRole('button', { name: 'Pause', exact: true }).click(); await expect(page.locator('audio[data-frame-mix-layer]')).toHaveJSProperty('paused', true);
    const documentDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save project', exact: true }).click(); const projectPath = (await (await documentDownload).path())!; const document = JSON.parse(await readFile(projectPath, 'utf8')); expect(document.sources[0].edit.audioLayers).toHaveLength(1); expect(document.sources[0].edit.audioLayers[0]).toMatchObject({ start: .01, source: { name: 'Song.wav' }, volume: .3, loop: true, fadeIn: .2 });
    await page.getByRole('tab', { name: 'Export', exact: true }).click(); await page.getByLabel('Output format', { exact: true }).selectOption('wav'); await page.getByRole('button', { name: 'Export WAV', exact: true }).click(); await expect(page.getByRole('link', { name: 'Save file', exact: true })).toBeVisible({ timeout: 45000 });
    const download = page.waitForEvent('download'); await page.getByRole('link', { name: 'Save file', exact: true }).click(); const path = info.outputPath('mixed.wav'); await (await download).saveAs(path); expect((await probeConversion(path)).streams[0].codec_name).toBe('pcm_s16le');
    await page.getByRole('button', { name: 'Reset all edits', exact: true }).click(); await expect(page.locator('audio[data-frame-mix-layer]')).toHaveCount(0);
    await page.getByLabel('Choose project file', { exact: true }).setInputFiles(projectPath); await expect(page.getByRole('button', { name: 'Restore edits', exact: true })).toBeEnabled(); await page.getByRole('button', { name: 'Restore edits', exact: true }).click(); await expect(page.locator('audio[data-frame-mix-layer]')).toHaveCount(1);
  } finally { await rm(library.directory, { recursive: true, force: true }); }
});
