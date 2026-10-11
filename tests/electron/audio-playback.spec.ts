import { test, expect, _electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { playbackMedia } from '../helpers/playback-media';

test('meters desktop protocol audio without silencing it and preserves playback while seeking', async () => {
  const fixtures = await playbackMedia(),
    directory = await mkdtemp(join(tmpdir(), 'frame-audio-monitor-'));
  const executablePath = process.env.FRAME_TEST_EXECUTABLE
    ? resolve(process.env.FRAME_TEST_EXECUTABLE)
    : undefined;
  const app = await _electron.launch({
    executablePath,
    args: [
      `--user-data-dir=${directory}`,
      ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []),
      ...(executablePath ? [] : ['.']),
    ],
    env: { ...process.env, FRAME_DEV_URL: '' },
  });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, fixtures.audio);
    await page.getByRole('button', { name: 'Add media', exact: true }).click();
    const audio = page.locator('audio[data-frame-source]');
    await expect(audio).toHaveAttribute('src', /^media:\/\/asset\//);
    await expect(audio).toHaveJSProperty('readyState', 4, { timeout: 30000 });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    const level = () =>
      page
        .locator('.audio-preview')
        .evaluate((element) => Number(element.style.getPropertyValue('--audio-level')));
    await expect.poll(level).toBeGreaterThan(0.03);
    await page.getByRole('button', { name: 'Forward five seconds', exact: true }).click();
    await expect(audio).toHaveJSProperty('paused', false);
    await expect
      .poll(() => audio.evaluate((media: HTMLMediaElement) => media.currentTime))
      .toBeGreaterThan(5);
    await page.getByLabel('Playback volume: 100%', { exact: true }).click();
    await page.getByRole('slider', { name: 'Playback volume', exact: true }).fill('50');
    await expect(audio).toHaveJSProperty('volume', 0.5);
    await page.getByRole('button', { name: 'Mute playback' }).click();
    await expect.poll(level).toBeLessThan(0.002);
    await page.getByRole('button', { name: 'Unmute playback' }).click();
    await expect.poll(level).toBeGreaterThan(0.01);
    await page.getByRole('slider', { name: 'Playback volume', exact: true }).press('Escape');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect.poll(level).toBeLessThan(0.002);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toHaveCount(0);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
    await rm(fixtures.directory, { recursive: true, force: true });
  }
});
