import { test, expect } from '@playwright/test';
import { readFile, rm } from 'node:fs/promises';
import { playbackMedia } from '../helpers/playback-media';
test('monitors volume separately from exports, skips five seconds without pausing, and meters audio', async ({
  page,
}) => {
  const fixtures = await playbackMedia();
  try {
    await page.goto('/');
    await expect(page.getByLabel('Autosave status')).not.toHaveText(/Reopening|Clearing/);
    const choosing = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Add media', exact: true }).click();
    await (await choosing).setFiles(fixtures.video);
    const video = page.locator('video[data-frame-source]');
    await expect(video).toHaveJSProperty('readyState', 4, { timeout: 45000 });
    await page.getByLabel('Playback volume: 100%', { exact: true }).click();
    await page.getByRole('slider', { name: 'Playback volume', exact: true }).fill('35');
    await expect(video).toHaveJSProperty('volume', 0.35);
    await page.getByRole('button', { name: 'Mute playback', exact: true }).click();
    await expect(video).toHaveJSProperty('volume', 0);
    await page.getByRole('button', { name: 'Unmute playback', exact: true }).click();
    await expect(video).toHaveJSProperty('volume', 0.35);
    await page.getByRole('slider', { name: 'Playback volume', exact: true }).press('Escape');
    await page.getByRole('button', { name: 'Forward five seconds', exact: true }).click();
    await expect
      .poll(() => video.evaluate((media: HTMLMediaElement) => media.currentTime))
      .toBeCloseTo(5, 2);
    await expect(video).toHaveJSProperty('paused', true);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.getByRole('button', { name: 'Forward five seconds', exact: true }).click();
    await expect
      .poll(() => video.evaluate((media: HTMLMediaElement) => media.currentTime))
      .toBeGreaterThanOrEqual(10);
    await expect(video).toHaveJSProperty('paused', false);
    const beforeBack = await video.evaluate((media: HTMLMediaElement) => media.currentTime);
    await page.getByRole('button', { name: 'Back five seconds', exact: true }).click();
    const afterBack = await video.evaluate((media: HTMLMediaElement) => media.currentTime);
    expect(afterBack).toBeLessThan(beforeBack);
    expect(afterBack).toBeGreaterThanOrEqual(beforeBack - 5.1);
    await expect(video).toHaveJSProperty('paused', false);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    const project = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
    expect(project.sources[0].edit.volume).toBe(1);
    const addingAudio = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Add media', exact: true }).click();
    await (await addingAudio).setFiles(fixtures.audio);
    const audio = page.locator('audio[data-frame-source]');
    await expect(audio).toHaveJSProperty('readyState', 4, { timeout: 45000 });
    await expect(audio).toHaveJSProperty('volume', 0.35);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    const level = () =>
      page
        .locator('.audio-preview')
        .evaluate((element) => Number(element.style.getPropertyValue('--audio-level')));
    await expect.poll(level).toBeGreaterThan(0.01);
    await page.getByRole('button', { name: 'Forward five seconds', exact: true }).click();
    await expect(audio).toHaveJSProperty('paused', false);
    await page.getByLabel('Playback volume: 35%', { exact: true }).click();
    await page.getByRole('button', { name: 'Mute playback', exact: true }).click();
    await expect.poll(level).toBeLessThan(0.002);
    await page.getByRole('button', { name: 'Unmute playback', exact: true }).click();
    await expect.poll(level).toBeGreaterThan(0.01);
    await page.getByRole('slider', { name: 'Playback volume', exact: true }).press('Escape');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect.poll(level).toBeLessThan(0.002);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Playback volume: 35%', { exact: true })).toBeVisible();
    for (const width of [850, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(
        page.getByRole('button', { name: 'Forward five seconds', exact: true }),
      ).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await page.screenshot({ path: 'test-results/player-controls-mobile.png' });
  } finally {
    await rm(fixtures.directory, { recursive: true, force: true });
  }
});
