import { insertAudioLayer, openAudioLayer } from '../helpers/audio-layers';
import { importTestMedia } from '../helpers/import-media';
import { expect, test } from '@playwright/test';
import { readFile, rm } from 'node:fs/promises';
import { conversionLibrary, probeConversion } from '../helpers/conversion-library';
import { closeEffect } from '../helpers/effects';
test('mixes music with video, moves and trims tracks, and restores their sources from a project', async ({ page }, info) => {
  const library = await conversionLibrary();
  try {
    await page.goto('/'); await importTestMedia(page); await expect(page.locator('.asset-list li')).toHaveCount(1); await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeEnabled();
    await page.getByLabel('Choose media files', { exact: true }).setInputFiles(library.sources[0]); await expect(page.locator('.asset-list li')).toHaveCount(2); await page.getByRole('button', { name: /^Studio study.mp4/ }).click();
    await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click(); await insertAudioLayer(page, 'Song.wav');
    await page.getByLabel('Track 1 volume', { exact: true }).fill('0.3'); await page.getByLabel('Loop track 1', { exact: true }).check(); await page.getByLabel('Track 1 fade in', { exact: true }).fill('0.2');
    // The compact timeline group can be opened independently of the inspector.
    const group = page.getByRole('group', { name: 'Audio layers', exact: true }); if (!await group.evaluate(node => (node as HTMLDetailsElement).open)) await group.locator('summary').click();
    const bar = page.getByRole('button', { name: 'Audio track 1: Song.wav', exact: true }); await expect(bar).toBeVisible(); await expect(page.locator('.audio-layer-lane .audio-waveform')).toBeVisible({ timeout: 45000 }); await closeEffect(page); await bar.press('Alt+ArrowRight'); await expect(page.getByRole('dialog', { name: 'Audio layer settings', exact: true })).toBeVisible(); await expect(page.getByRole('slider', { name: 'Audio track 1: Song.wav start', exact: true })).toHaveAttribute('aria-valuenow', '0.01');
    await page.getByRole('slider', { name: 'Audio track 1: Song.wav end', exact: true }).press('ArrowRight');
    await page.getByRole('button', { name: 'Remove Song.wav', exact: true }).click(); await expect(page.locator('.asset-list li')).toHaveCount(2); await expect(page.getByText('Remove this source’s audio layers before removing it from the library.', { exact: true })).toBeVisible();
    await openAudioLayer(page, 'Song.wav');
    await page.getByRole('button', { name: 'Measure edited loudness', exact: true }).click(); await expect(page.getByLabel('Edited audio loudness')).toContainText('LUFS', { timeout: 45000 });
    await page.getByRole('button', { name: 'Play', exact: true }).click(); await expect(page.locator('audio[data-frame-mix-layer]')).toHaveJSProperty('paused', false); await page.getByRole('button', { name: 'Pause', exact: true }).click(); await expect(page.locator('audio[data-frame-mix-layer]')).toHaveJSProperty('paused', true);
    const documentDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save project', exact: true }).click(); const projectPath = (await (await documentDownload).path())!; const document = JSON.parse(await readFile(projectPath, 'utf8')); expect(document.sources[0].edit.audioLayers).toHaveLength(1); expect(document.sources[0].edit.audioLayers[0]).toMatchObject({ start: .01, source: { name: 'Song.wav' }, volume: .3, loop: true, fadeIn: .2 });
    await closeEffect(page); await page.getByRole('tab', { name: 'Export', exact: true }).click(); await page.getByLabel('Output format', { exact: true }).selectOption('wav'); await closeEffect(page); await page.getByRole('button', { name: 'Export WAV', exact: true }).click(); await expect(page.getByRole('link', { name: 'Save file', exact: true })).toBeVisible({ timeout: 45000 });
    const download = page.waitForEvent('download'); await page.getByRole('link', { name: 'Save file', exact: true }).click(); const path = info.outputPath('mixed.wav'); await (await download).saveAs(path); expect((await probeConversion(path)).streams[0].codec_name).toBe('pcm_s16le');
    await page.getByRole('button', { name: 'Reset all edits', exact: true }).click(); await expect(page.locator('audio[data-frame-mix-layer]')).toHaveCount(0);
    await page.getByLabel('Choose project file', { exact: true }).setInputFiles(projectPath); await expect(page.getByRole('button', { name: 'Restore edits', exact: true })).toBeEnabled(); await page.getByRole('button', { name: 'Restore edits', exact: true }).click(); await expect(page.locator('audio[data-frame-mix-layer]')).toHaveCount(1);
  } finally { await rm(library.directory, { recursive: true, force: true }); }
});
test('automatically generates track waveforms and updates their shape while trimming', async ({ page }) => {
  const library = await conversionLibrary();
  try {
    await page.goto('/'); await importTestMedia(page); await expect(page.locator('.asset-list li')).toHaveCount(1); await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeEnabled();
    await page.getByLabel('Choose media files', { exact: true }).setInputFiles(library.sources[0]); await expect(page.locator('.asset-list li')).toHaveCount(2); await page.getByRole('button', { name: /^Studio study.mp4/ }).click();
    await insertAudioLayer(page, 'Song.wav'); await page.getByLabel('Track 1 fade in').fill('0.5'); const group = page.getByRole('group', { name: 'Audio layers', exact: true }); if (!await group.evaluate(node => (node as HTMLDetailsElement).open)) await group.locator('summary').click();
    await expect(page.getByRole('button', { name: /Generate waveform/ })).toHaveCount(0); const waveform = page.locator('.audio-layer-bar .audio-waveform path'); await expect(waveform).toBeVisible({ timeout: 30000 }); const original = await waveform.getAttribute('d');
    const edge = page.getByRole('slider', { name: 'Audio track 1: Song.wav start', exact: true }); await edge.scrollIntoViewIfNeeded(); const bounds = (await edge.boundingBox())!, lane = (await page.locator('.audio-layer-lane').boundingBox())!;
    await page.keyboard.down('Alt'); await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down(); await expect(page.getByRole('dialog', { name: 'Audio layer settings', exact: true })).toBeVisible(); await page.mouse.move(bounds.x + bounds.width / 2 + lane.width / 15, bounds.y + bounds.height / 2, { steps: 6 }); await expect(waveform).not.toHaveAttribute('d', original!); await page.keyboard.press('Escape'); await page.mouse.up(); await page.keyboard.up('Alt'); await expect(edge).toHaveAttribute('aria-valuenow', '0'); await expect(waveform).toHaveAttribute('d', original!);
  } finally { await rm(library.directory, { recursive: true, force: true }); }
});
