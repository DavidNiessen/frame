import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { verifyLibraryInsertion } from '../helpers/library-insertion';
import { probeConversion } from '../helpers/conversion-library';
test('inserts library videos and audio, extracts audio, exports and automatically restores the sequence', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
  await page.goto('/');
  await expect(page.getByLabel('Autosave status')).not.toHaveText(/Reopening|Clearing/);
  const buffer = await readFile(resolve('tests/fixtures/sample.mp4'));
  await page
    .getByLabel('Choose media files', { exact: true })
    .setInputFiles(
      ['First.mp4', 'Second.mp4', 'Third.mp4'].map((name) => ({
        name,
        mimeType: 'video/mp4',
        buffer,
      })),
    );
  await verifyLibraryInsertion(page);
  await page.reload();
  await expect(page.locator('.asset-list li')).toHaveCount(6, { timeout: 60000 });
  await expect(page.locator('.timeline-clip')).toHaveCount(3);
  await expect(page.locator('.audio-layer-bar')).toHaveCount(1);
  await expect(page.getByLabel('Trim start', { exact: true })).toHaveAttribute(
    'aria-valuenow',
    '1',
  );
  await page.getByRole('button', { name: 'Volume effect', exact: true }).click();
  await expect(page.getByLabel('Volume', { exact: true })).toHaveValue('0.4');
  await page.getByRole('button', { name: 'Close effect settings', exact: true }).click();
  const documentDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const project = JSON.parse(await readFile((await (await documentDownload).path())!, 'utf8'));
  const edit = project.sources[project.selectedSource].edit;
  expect(edit.clips.map((clip: { source: { name: string } }) => clip.source.name)).toEqual([
    'First.mp4',
    'Second.mp4',
    'Third.mp4',
  ]);
  expect(edit.audioLayers).toHaveLength(1);
  expect(edit.audioLayers[0]).toMatchObject({
    volume: 0.25,
    start: 5,
    source: { name: 'First-audio.flac' },
  });
  await page.getByRole('button', { name: 'Export MP4', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Save file', exact: true })).toBeVisible({
    timeout: 60000,
  });
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Save file', exact: true }).click();
  const output = info.outputPath('sequence.mp4');
  await (await download).saveAs(output);
  const probe = await probeConversion(output);
  expect(Number(probe.format.duration)).toBeCloseTo(16, 1);
  expect(probe.streams.map((stream: { codec_type: string }) => stream.codec_type).sort()).toEqual([
    'audio',
    'video',
  ]);
});
