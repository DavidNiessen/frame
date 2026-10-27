import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { ffmpegPath, probeFile } from '../../electron/native';

const exec = promisify(execFile);

test('imports AIF and AIFF audio and converts them together in the browser', async ({
  page,
}, info) => {
  const input = info.outputPath('song.aif');
  await exec(ffmpegPath(), [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=2',
    '-c:a',
    'pcm_s24be',
    input,
  ]);
  const buffer = await readFile(input);
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Workflow' })
    .getByRole('button', { name: 'Convert', exact: true })
    .click();
  await page.getByLabel('Choose media files').setInputFiles([
    { name: 'song.aif', mimeType: 'audio/aiff', buffer },
    { name: 'song.AIFF', mimeType: 'audio/x-aiff', buffer },
  ]);
  await expect(page.locator('.conversion-table tbody tr')).toHaveCount(2, { timeout: 45000 });
  await page.getByLabel('Conversion format').selectOption('flac');
  await page.getByRole('button', { name: 'Convert 2 files', exact: true }).click();
  await expect(page.getByText('Converted', { exact: true })).toHaveCount(2, { timeout: 45000 });
  const downloads = page.getByRole('link', { name: /^Download song/ });
  await expect(downloads).toHaveCount(2);
  for (let index = 0; index < 2; index++) {
    const pending = page.waitForEvent('download');
    await downloads.nth(index).click();
    const output = info.outputPath(`converted-${index}.flac`);
    await (await pending).saveAs(output);
    const audio = await probeFile(output);
    expect(audio.kind).toBe('audio');
    expect(audio.duration).toBeCloseTo(2, 2);
    expect(audio.hasAudio).toBe(true);
  }
});
