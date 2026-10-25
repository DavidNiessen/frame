import { expect, type ElectronApplication, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ffmpegPath } from '../../electron/native';
import { importTestMedia } from './import-media';
import { closeEffect, openEffect } from './effects';

export async function verifyLiveEffects(page: Page, app?: ElectronApplication) {
  const directory = await mkdtemp(join(tmpdir(), 'frame-live-effects-')),
    tone = join(directory, 'tone.wav');
  try {
    await promisify(execFile)(ffmpegPath(), [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=1000:duration=8',
      tone,
    ]);
    await expect(page.getByLabel('Autosave status')).not.toHaveText(/Reopening|Clearing/);
    await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeEnabled();
    if (app) {
      await app.evaluate(({ dialog }, path) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
      }, tone);
      await page.getByRole('button', { name: 'Add media', exact: true }).click();
    } else {
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Add media', exact: true }).click();
      await (await chooser).setFiles(tone);
    }
    await expect(page.locator('.asset-list li')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeEnabled();
    const media = page.locator('.audio-stage audio');
    await expect(media).toHaveJSProperty('readyState', 4);
    // Observe Frame's own audio route; creating a second MediaElementSource
    // would steal playback from the application and hide live-processing bugs.
    await page.evaluate(() => {
      const create = AudioContext.prototype.createAnalyser;
      AudioContext.prototype.createAnalyser = function () {
        const analyser = create.call(this);
        (
          window as typeof window & {
            effectAudio: { context: AudioContext; analyser: AnalyserNode };
          }
        ).effectAudio = { context: this, analyser };
        return analyser;
      };
    });
    const rms = async () => {
      return page.evaluate(() => {
        const { analyser } = (window as typeof window & { effectAudio: { analyser: AnalyserNode } })
          .effectAudio;
        const data = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(data);
        return Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
      });
    };
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => page.evaluate(() => 'effectAudio' in window)).toBe(true);
    await page.evaluate(() =>
      (
        window as typeof window & { effectAudio: { context: AudioContext } }
      ).effectAudio.context.resume(),
    );
    await expect.poll(rms).toBeGreaterThan(0.07);
    const original = await rms();
    expect(original).toBeGreaterThan(0.07);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByLabel('Seek playhead').fill('0.5');
    const originalSource = await media.getAttribute('src');
    await openEffect(page, 'Equalizer');
    await page.getByLabel('Equalizer mid', { exact: true }).fill('-12');
    await expect(media).toHaveAttribute('src', originalSource!);
    await expect(media).not.toHaveAttribute('data-preview-effects', 'rendered');
    await expect(page.locator('progress, [role=progressbar]')).toHaveCount(0);
    await expect(media).toHaveJSProperty('readyState', 4);
    await expect(media).toHaveJSProperty('volume', 1);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(rms).toBeGreaterThan(0.01);
    await expect.poll(rms).toBeLessThan(original * 0.35);
    const processed = await rms();
    expect(processed).toBeGreaterThan(0.01);
    expect(processed).toBeLessThan(original * 0.35);
    const cursor = Number(await page.getByLabel('Seek playhead').inputValue());
    await expect
      .poll(async () => Number(await page.getByLabel('Seek playhead').inputValue()))
      .toBeGreaterThan(cursor + 0.3);
    await expect(page.locator('.effect-settings-overlay')).toBeVisible();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Remove Equalizer', exact: true }).click();
    await expect(media).not.toHaveAttribute('data-preview-effects', 'rendered');
    await expect(page.getByRole('contentinfo', { name: 'Workspace status' })).toHaveAttribute(
      'aria-busy',
      'false',
      { timeout: 15000 },
    );
    await page.getByRole('button', { name: 'Clear media library', exact: true }).click();
    // Color LUTs must affect the video frames, not just a CSS approximation or a still export.
    await importTestMedia(page, app);
    const video = page.locator('video');
    await expect(video).toHaveJSProperty('readyState', 4);
    await openEffect(page, 'Equalizer');
    await page.getByLabel('Equalizer mid', { exact: true }).fill('6');
    await expect(video).not.toHaveAttribute('data-preview-effects', 'rendered');
    await expect(video).toHaveJSProperty('readyState', 4);
    const audioOnlySource = await video.getAttribute('src');
    await openEffect(page, 'Color & LUTs');
    await page.getByLabel('LUT file', { exact: true }).setInputFiles({
      name: 'red.cube',
      mimeType: 'text/plain',
      buffer: Buffer.from('LUT_3D_SIZE 2\n' + Array(8).fill('1 0 0').join('\n')),
    });
    // The LUT grades the decoded frames on the GPU; it must not encode a new preview.
    const graded = page.locator('canvas[data-realtime-grade]');
    await expect(graded).toHaveCount(1);
    await expect(video).toHaveAttribute('src', audioOnlySource!);
    await expect(video).not.toHaveAttribute('data-preview-effects', 'rendered');
    await expect(video).toHaveCSS('filter', 'none');
    const pixel = () =>
      graded.evaluate((node: HTMLCanvasElement) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const c = canvas.getContext('2d')!;
        c.drawImage(node, 0, 0, 1, 1);
        return [...c.getImageData(0, 0, 1, 1).data];
      });
    await expect.poll(async () => (await pixel())[0]).toBeGreaterThan(220);
    const color = await pixel();
    expect(color[0]).toBeGreaterThan(220);
    expect(color[1]).toBeLessThan(25);
    expect(color[2]).toBeLessThan(25);
    const source = await video.getAttribute('src');
    await closeEffect(page);
    await openEffect(page, 'Captions');
    await page.getByLabel('Caption text', { exact: true }).fill('Still editable');
    await closeEffect(page);
    await expect(video).toHaveAttribute('src', source!);
    await expect(page.getByRole('button', { name: 'Reset all edits', exact: true })).toHaveCount(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
