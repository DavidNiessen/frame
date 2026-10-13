import { expect, test, _electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const audio = process.env.FRAME_SPEECH_TEST_AUDIO;
test('native local speech recognition generates individual editable caption effects with bundled models', async () => {
  test.skip(!audio, 'Set FRAME_SPEECH_TEST_AUDIO for real model inference.');
  test.setTimeout(180000);
  const directory = await mkdtemp(join(tmpdir(), 'frame-transcription-'));
  const executablePath = process.env.FRAME_TEST_EXECUTABLE;
  const app = await _electron.launch({
    executablePath,
    args: [
      `--user-data-dir=${join(directory, 'profile')}`,
      ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []),
      ...(executablePath ? [] : ['.']),
    ],
    env: { ...process.env, PATH: '', FRAME_DEV_URL: '' },
  });
  try {
    await app.evaluate(({ dialog, net }, input) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [input] });
      net.fetch = async () => {
        throw new Error('Offline test: media must not be uploaded.');
      };
    }, resolve(audio!));
    const page = await app.firstWindow();
    await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Add media', exact: true }).click();
    await page.getByText('Caption tools', { exact: true }).click();
    await page.getByRole('button', { name: 'Generate captions locally', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Generate captions locally', exact: true });
    await modal.getByLabel('Speech language', { exact: true }).selectOption('english');
    await modal.getByRole('button', { name: 'Generate captions locally', exact: true }).click();
    await expect(modal.getByLabel('Generated captions')).toContainText(/country|Americans|ask/i, {
      timeout: 120000,
    });
    await modal.getByRole('button', { name: /Add \d+ captions to timeline/ }).click();
    await expect(page.locator('.effect-settings-overlay')).toHaveCount(0);
    await expect(page.locator('.caption-bar')).not.toHaveCount(0);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
