import { test, expect, _electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { importTestMedia } from '../helpers/import-media';

test('prepares video sequences and extracts audio using bundled native tools without save dialogs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-prepared-native-')),
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
    await importTestMedia(page, app);
    await app.evaluate(({ dialog }) => {
      dialog.showSaveDialog = async () => {
        throw new Error('Preparation must not open a save dialog.');
      };
    });
    const id = (await page.locator('video').getAttribute('data-frame-source'))!;
    const audio = await page.evaluate((id) => window.frameDesktop!.extractAudio(id), id);
    expect(audio.name).toBe('sample-audio.flac');
    expect(audio.kind).toBe('audio');
    expect(audio.audioCodec).toBe('flac');
    expect(audio.duration).toBeCloseTo(6, 1);
    const sequence = await page.evaluate((id) => window.frameDesktop!.appendVideo(id, id), id);
    expect(sequence.name).toBe('sample-sequence.mp4');
    expect(sequence.duration).toBeCloseTo(12, 1);
    await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
    expect(
      await page.evaluate(
        (asset) =>
          new Promise<number>((resolve, reject) => {
            const media = new Audio(asset.previewUrl);
            media.onloadedmetadata = () => {
              const duration = media.duration;
              media.removeAttribute('src');
              media.load();
              resolve(duration);
            };
            media.onerror = () => reject(new Error('Prepared audio could not be decoded.'));
          }),
        audio,
      ),
    ).toBeCloseTo(6, 1);
    await page.evaluate(
      async (ids) => {
        for (const id of ids) await window.frameDesktop!.release(id);
      },
      [audio.id, sequence.id],
    );
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
