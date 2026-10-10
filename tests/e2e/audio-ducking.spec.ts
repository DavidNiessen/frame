import { insertAudioLayer } from '../helpers/audio-layers';
import { expect, test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegPath } from '../../electron/native';
import { closeEffect } from '../helpers/effects';
const exec = promisify(execFile);
test('renders dialogue-driven music ducking in a browser export', async ({ page }, info) => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-browser-ducking-'));
  try {
    const voice = join(directory, 'voice.wav'), music = join(directory, 'music.wav');
    await exec(ffmpegPath(), ['-y', '-f', 'lavfi', '-i', 'aevalsrc=if(between(t\\,1\\,2)\\,0.5*sin(2*PI*880*t)\\,0):s=48000:d=4', '-c:a', 'pcm_f32le', voice]); await exec(ffmpegPath(), ['-y', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=4', music]);
    await page.goto('/'); await expect(page.getByLabel('Autosave status')).not.toHaveText(/Reopening|Clearing/); await page.getByLabel('Choose media files', { exact: true }).setInputFiles([voice, music]); await expect(page.locator('.asset-list li')).toHaveCount(2, { timeout: 30000 }); await page.getByRole('button', { name: /^voice.wav/ }).click();
    await insertAudioLayer(page, 'music.wav'); await page.getByLabel('Track 1 volume').fill('1'); await page.getByLabel('Track 1 purpose').selectOption('music'); await page.getByLabel('Duck music under dialogue').check(); await expect(page.getByText('Ducking uses the actual dialogue level.', { exact: false })).toBeVisible();
    await closeEffect(page); await page.getByRole('tab', { name: 'Export', exact: true }).click(); await closeEffect(page); await page.getByLabel('Output format').selectOption('wav'); await closeEffect(page); await page.getByRole('button', { name: 'Export WAV', exact: true }).click(); await expect(page.getByRole('link', { name: 'Save file', exact: true })).toBeVisible({ timeout: 30000 }); const pending = page.waitForEvent('download'); await page.getByRole('link', { name: 'Save file', exact: true }).click(); const output = info.outputPath('ducked.wav'), raw = info.outputPath('ducked.raw'); await (await pending).saveAs(output); await exec(ffmpegPath(), ['-y', '-i', output, '-ac', '1', '-ar', '48000', '-f', 'f32le', raw]); const data = await readFile(raw);
    const amplitude = (frequency: number, start: number) => { let real = 0, imaginary = 0; const count = 9600; for (let n = 0; n < count; n++) { const sample = data.readFloatLE((Math.round(start * 48000) + n) * 4), angle = 2 * Math.PI * frequency * n / 48000; real += sample * Math.cos(angle); imaginary += sample * Math.sin(angle); } return Math.hypot(real, imaginary) * 2 / count; };
    expect(amplitude(220, 1.4)).toBeLessThan(amplitude(220, .3) * .4); expect(amplitude(880, 1.4)).toBeGreaterThan(.2); expect(amplitude(220, 3.6)).toBeGreaterThan(amplitude(220, .3) * .9);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
