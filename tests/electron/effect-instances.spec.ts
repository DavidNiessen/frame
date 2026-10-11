import { importTestMedia } from '../helpers/import-media';
import { expect, test, _electron } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { closeEffect } from '../helpers/effects';
import { probeConversion } from '../helpers/conversion-library';
test('edits, saves and exports independent effects with the portable desktop engine', async () => {
  test.setTimeout(120000);
  const directory = await mkdtemp(join(tmpdir(), 'frame-native-instances-')),
    executablePath = process.env.FRAME_TEST_EXECUTABLE;
  const app = await _electron.launch({
    executablePath: executablePath ? resolve(executablePath) : undefined,
    args: [
      `--user-data-dir=${join(directory, 'profile')}`,
      ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []),
      ...(executablePath ? [] : ['.']),
    ],
    env: { ...process.env, PATH: '', FRAME_DEV_URL: '' },
  });
  try {
    const page = await app.firstWindow();
    await page.evaluate(() => localStorage.setItem('frame:auto-waveforms', 'false'));
    await page.reload();
    await importTestMedia(page, app);
    await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
    await page.getByRole('button', { name: 'Add Volume', exact: true }).click();
    await page.getByRole('button', { name: 'Volume effect', exact: true }).click();
    await page.getByLabel('Volume', { exact: true }).fill('0.5');
    await closeEffect(page);
    await page.getByRole('button', { name: 'Add Volume', exact: true }).click();
    await page.getByRole('button', { name: 'Volume instance 2 effect', exact: true }).click();
    await page.getByLabel('Volume', { exact: true }).fill('0.4');
    await expect(page.locator('video')).toHaveJSProperty('volume', 0.2);
    await closeEffect(page);
    await page.getByRole('button', { name: 'Add Audio fade out', exact: true }).click();
    await page.getByRole('button', { name: 'Audio fade out effect', exact: true }).click();
    await page.getByLabel('Audio fade out duration', { exact: true }).fill('2');
    await closeEffect(page);
    await page.getByLabel('Seek playhead').fill('5');
    await page.getByRole('button', { name: 'Split', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Audio fade out effect', exact: true }),
    ).toHaveCount(1);
    await page.getByLabel('Seek playhead').fill('0');
    await page.getByRole('button', { name: 'Add Captions', exact: true }).click();
    await page.getByRole('button', { name: 'Add Captions', exact: true }).click();
    await page.getByRole('button', { name: 'Caption 2', exact: true }).click();
    await page.getByLabel('Caption text', { exact: true }).fill('Second caption');
    await closeEffect(page);
    const project = join(directory, 'instances.frame.json');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, project);
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect
      .poll(() =>
        readFile(project, 'utf8').then(
          (text) => JSON.parse(text).sources[0].edit.effectInstances.length,
        ),
      )
      .toBe(5);
    const edit = JSON.parse(await readFile(project, 'utf8')).sources[0].edit;
    expect(edit.volume).toBe(1);
    const volume = edit.effectInstances.filter(
      (instance: { effect: string }) => instance.effect === 'volume',
    )[1];
    expect(volume.settings.volume).toBe(0.4);
    expect(volume.range).toEqual({ start: 0, end: 2 });
    expect(
      edit.effectInstances.filter(
        (instance: { effect: string }) => instance.effect === 'captions',
      )[1].settings.subtitles.cues[0].text,
    ).toBe('Second caption');
    expect(
      edit.effectInstances.every(
        (instance: { timeSpace: string }) => instance.timeSpace === 'output',
      ),
    ).toBe(true);
    expect(
      edit.clips.every((clip: { effects: object }) => Object.keys(clip.effects).length === 0),
    ).toBe(true);
    const output = join(directory, 'instances.mp4');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, output);
    await page.getByRole('button', { name: 'Export MP4', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Export MP4', exact: true })).toBeEnabled({
      timeout: 45000,
    });
    expect(
      (await probeConversion(output)).streams.some(
        (stream: { codec_type: string }) => stream.codec_type === 'audio',
      ),
    ).toBe(true);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
