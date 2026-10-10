import { expect, test, _electron } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { closeEffect } from '../helpers/effects';
import { probeConversion } from '../helpers/conversion-library';
test('edits, saves and exports independent effects with the portable desktop engine', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-native-instances-')), executablePath = process.env.FRAME_TEST_EXECUTABLE;
  const app = await _electron.launch({ executablePath: executablePath ? resolve(executablePath) : undefined, args: [`--user-data-dir=${join(directory, 'profile')}`, ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []), ...(executablePath ? [] : ['.'])], env: { ...process.env, PATH: '', FRAME_DEV_URL: '' } });
  try {
    const page = await app.firstWindow(); await page.evaluate(() => localStorage.setItem('frame:auto-waveforms', 'false')); await page.reload();
    await page.getByRole('button', { name: 'Try a sample', exact: true }).click(); await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
    await page.getByRole('button', { name: 'Add Volume', exact: true }).click(); await page.getByRole('button', { name: 'Add Volume', exact: true }).click();
    await page.getByRole('button', { name: 'Volume clip 1', exact: true }).click(); await page.getByLabel('Volume', { exact: true }).fill('0.5'); await closeEffect(page);
    await page.getByRole('button', { name: 'Volume instance 2 clip 1', exact: true }).click(); await page.getByLabel('Volume', { exact: true }).fill('0.4'); await expect(page.locator('video')).toHaveJSProperty('volume', .2); await closeEffect(page);
    await page.getByRole('button', { name: 'Add Captions', exact: true }).click(); await page.getByRole('button', { name: 'Add Captions', exact: true }).click();
    await page.getByRole('button', { name: 'Caption 2', exact: true }).click(); await page.getByLabel('Subtitle 1 text').fill('Second caption'); await closeEffect(page);
    const project = join(directory, 'instances.frame.json'); await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, project);
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect.poll(() => readFile(project, 'utf8').then(text => JSON.parse(text).sources[0].edit.effectInstances.length)).toBe(2);
    const edit = JSON.parse(await readFile(project, 'utf8')).sources[0].edit;
    expect(edit.volume).toBe(.5); expect(edit.effectInstances.find((instance: { effect: string }) => instance.effect === 'volume').settings.volume).toBe(.4);
    expect(edit.effectInstances.find((instance: { effect: string }) => instance.effect === 'captions').settings.subtitles.cues[0].text).toBe('Second caption');
    const output = join(directory, 'instances.mp4'); await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, output);
    await page.getByRole('button', { name: 'Export MP4', exact: true }).click(); await expect(page.getByText('Export ready', { exact: true })).toBeVisible();
    expect((await probeConversion(output)).streams.some((stream: { codec_type: string }) => stream.codec_type === 'audio')).toBe(true);
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});
