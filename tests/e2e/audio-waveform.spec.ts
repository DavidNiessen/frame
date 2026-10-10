import { test, expect, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ffmpegPath } from '../../electron/native';
import { trim, setBoundary } from '../helpers/timeline';
const ffmpeg = ffmpegPath();
const exec = promisify(execFile);

async function tone(file: string, duration = 4) {
  await exec(ffmpeg!, ['-y', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${duration}`, '-af', "volume=enable='gte(t,2)':volume=0", file]);
}
async function chooseAudio(page: Page, file: string | string[]) {
  await expect(page.getByLabel('Autosave status')).not.toHaveText(/Reopening|Clearing/);
  const previous = await page.locator('.asset-list li').count();
  const choosing = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Add media', exact: true }).click();
  await (await choosing).setFiles(file);
  await expect(page.locator('.asset-list li')).toHaveCount(previous + (Array.isArray(file) ? file.length : 1), { timeout: 30000 });
  await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeEnabled();
}
async function importAudio(page: Page, file: string) {
  await chooseAudio(page, file);
  await expect(page.getByRole('img', { name: 'Audio waveform', exact: true })).toBeVisible({ timeout: 45000 });
  await expect(page.getByRole('slider', { name: 'Trim start', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Generate waveform' })).toHaveCount(0);
}
function peaks(path: string) {
  return [...path.matchAll(/M[\d.e+-]+,([\d.e+-]+)/g)].map(m => 50 - Number(m[1]));
}

test('automatically renders audio and clips the source peaks through trimming, splits, removal and undo', async ({ page }, testInfo) => {
  const input = testInfo.outputPath('loud-then-quiet.wav'); await tone(input);
  await page.goto('/'); await importAudio(page, input);
  const waves = page.getByRole('img', { name: 'Audio waveform', exact: true });
  const original = await waves.locator('path').getAttribute('d');
  await trim(page, 'start', .5); await trim(page, 'end', 3.5);
  await expect(waves).toHaveAttribute('data-start', '0.5'); await expect(waves).toHaveAttribute('data-end', '3.5');
  expect(await waves.locator('path').getAttribute('d')).not.toBe(original);
  await page.getByLabel('Seek playhead').fill('2'); await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(waves).toHaveCount(2);
  await expect(waves.nth(0)).toHaveAttribute('data-start', '0.5'); await expect(waves.nth(0)).toHaveAttribute('data-end', '2');
  await expect(waves.nth(1)).toHaveAttribute('data-start', '2'); await expect(waves.nth(1)).toHaveAttribute('data-end', '3.5');
  expect(Math.max(...peaks((await waves.nth(0).locator('path').getAttribute('d'))!))).toBeGreaterThan(4);
  const quiet = peaks((await waves.nth(1).locator('path').getAttribute('d'))!);
  // FFmpeg's volume filter switches at audio block boundaries; a peak window can straddle 2s.
  expect(quiet.filter(height => height > 1).length).toBeLessThan(quiet.length * .05);
  await setBoundary(page, 'Section 2 start', 2.5);
  await expect(waves.nth(1)).toHaveAttribute('data-start', '2.5');
  expect(Math.max(...peaks((await waves.nth(1).locator('path').getAttribute('d'))!))).toBeLessThan(1);
  const clip = page.locator('.timeline-clip').nth(1), wave = waves.nth(1);
  const box = (await clip.boundingBox())!, svg = (await wave.boundingBox())!;
  expect(svg.x).toBeGreaterThanOrEqual(box.x); expect(svg.x + svg.width).toBeLessThanOrEqual(box.x + box.width);
  expect(await page.locator('.timeline-track > .audio-waveform').count()).toBe(0);
  await page.getByRole('button', { name: /Select section 2,/ }).click(); await page.getByRole('button', { name: 'Remove selected section' }).click();
  await expect(waves).toHaveCount(1); await expect(waves).toHaveAttribute('data-end', '2');
  await page.getByRole('button', { name: 'Undo edit' }).click(); await expect(waves).toHaveCount(2);
  await expect(waves.nth(1)).toHaveAttribute('data-start', '2.5');
});

test('updates the waveform during edge dragging and restores it when the gesture is cancelled', async ({ page }, testInfo) => {
  const input = testInfo.outputPath('trim-live.wav'); await tone(input);
  await page.goto('/'); await importAudio(page, input);
  const wave = page.getByRole('img', { name: 'Audio waveform', exact: true });
  const handle = page.getByRole('slider', { name: 'Trim start', exact: true });
  const b = (await handle.boundingBox())!, track = (await page.locator('.timeline-track').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + track.width / 4, b.y + b.height / 2, { steps: 12 });
  await expect(wave).toHaveAttribute('data-start', '1');
  await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(wave).toHaveAttribute('data-start', '0');
  await expect(page.getByRole('button', { name: 'Undo edit' })).toBeDisabled();
  await trim(page, 'start', 2.5);
  expect(Math.max(...peaks((await wave.locator('path').getAttribute('d'))!))).toBeLessThan(1);
});

test('automatically generates newly selected audio and reuses cached peaks when switching back', async ({ page }, testInfo) => {
  const first = testInfo.outputPath('first.wav'), second = testInfo.outputPath('second.wav');
  await tone(first); await tone(second, 3);
  await page.goto('/'); await chooseAudio(page, [first, second]);
  await expect(page.getByRole('img', { name: 'Audio waveform', exact: true })).toBeVisible({ timeout: 45000 });
  await expect(page.getByRole('slider', { name: 'Trim start', exact: true })).toBeEnabled();
  const initial = await page.getByRole('img', { name: 'Audio waveform', exact: true }).locator('path').getAttribute('d');
  await page.locator('.asset-select').filter({ hasText: 'second.wav' }).click();
  await expect(page.getByRole('img', { name: 'Audio waveform', exact: true })).toHaveAttribute('data-end', '3', { timeout: 45000 });
  await expect(page.getByRole('slider', { name: 'Trim start', exact: true })).toBeEnabled();
  expect(await page.getByRole('img', { name: 'Audio waveform', exact: true }).locator('path').getAttribute('d')).not.toBe(initial);
  await page.getByRole('button', { name: /first.wav/ }).first().click();
  await expect(page.getByRole('img', { name: 'Audio waveform', exact: true }).locator('path')).toHaveAttribute('d', initial!);
  await expect(page.getByRole('button', { name: 'Cancel waveform' })).toHaveCount(0);
  await expect(page.getByRole('slider', { name: 'Trim start', exact: true })).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('can cancel automatic analysis without a retry loop and generate the waveform on retry', async ({ page }, testInfo) => {
  const input = testInfo.outputPath('retry.wav'); await tone(input);
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage; let requests = 0;
    Worker.prototype.postMessage = function(this: Worker, message: unknown, options?: Transferable[] | StructuredSerializeOptions) {
      const packet = message as { type?: string; data?: { args?: string[] } };
      if (packet.type === 'EXEC' && packet.data?.args?.some(arg => arg.includes('astats=metadata'))) {
        Reflect.set(window, 'waveformRequests', ++requests);
        // Hold the first analysis command to exercise interruption regardless of processor speed.
        if (requests === 1) return;
      }
      Reflect.apply(post, this, [message, options ?? []]);
    };
  });
  await page.goto('/'); await chooseAudio(page, input);
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'waveformRequests')), { timeout: 45000 }).toBe(1);
  await page.getByRole('button', { name: 'Cancel waveform' }).click();
  await expect(page.getByRole('alert')).toContainText('Waveform generation cancelled.');
  await expect(page.getByRole('button', { name: 'Retry waveform' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Cancel waveform' })).toHaveCount(0);
  await page.getByLabel('Seek playhead').fill('1');
  await page.getByRole('button', { name: 'Retry waveform' }).click();
  await expect(page.getByRole('img', { name: 'Audio waveform', exact: true })).toBeVisible({ timeout: 45000 });
  expect(await page.evaluate(() => Reflect.get(window, 'waveformRequests'))).toBe(2);
});

test('remembers disabled waveforms without manual controls and resumes when enabled', async ({ page }, testInfo) => {
  const first = testInfo.outputPath('manual.wav'), second = testInfo.outputPath('automatic.wav');
  await tone(first); await tone(second);
  await page.addInitScript(() => {
    Reflect.set(window, 'waveformRequests', 0);
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function(this: Worker, message: unknown, options?: Transferable[] | StructuredSerializeOptions) {
      const packet = message as { type?: string; data?: { args?: string[] } };
      if (packet.type === 'EXEC' && packet.data?.args?.some(arg => arg.includes('astats=metadata'))) Reflect.set(window, 'waveformRequests', Reflect.get(window, 'waveformRequests') + 1);
      Reflect.apply(post, this, [message, options ?? []]);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const preference = page.getByRole('checkbox', { name: 'Generate audio waveforms automatically' });
  await expect(preference).toBeChecked();
  await preference.uncheck();
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(preference).not.toBeChecked();
  await page.getByRole('button', { name: 'Back to workspace' }).click();
  await chooseAudio(page, first);
  await expect(page.getByRole('slider', { name: 'Trim start', exact: true })).toBeEnabled({ timeout: 45000 });
  await expect(page.getByRole('button', { name: 'Generate waveform', exact: true })).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'Audio waveform', exact: true })).toHaveCount(0);
  await expect(page.getByText('Preparing waveform…', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, 'waveformRequests'))).toBe(0);
  await chooseAudio(page, second);
  await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Generate waveform', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, 'waveformRequests'))).toBe(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await preference.check();
  await page.getByRole('button', { name: 'Back to workspace' }).click();
  await expect(page.getByRole('img', { name: 'Audio waveform', exact: true })).toBeVisible({ timeout: 45000 });
  expect(await page.evaluate(() => Reflect.get(window, 'waveformRequests'))).toBe(1);
});

test('turning automatic waveforms off cancels pending analysis and re-enabling restarts it', async ({ page }, testInfo) => {
  const input = testInfo.outputPath('interrupted.wav'); await tone(input);
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage; let requests = 0;
    Worker.prototype.postMessage = function(this: Worker, message: unknown, options?: Transferable[] | StructuredSerializeOptions) {
      const packet = message as { type?: string; data?: { args?: string[] } };
      if (packet.type === 'EXEC' && packet.data?.args?.some(arg => arg.includes('astats=metadata'))) {
        Reflect.set(window, 'waveformRequests', ++requests);
        if (requests === 1) return;
      }
      Reflect.apply(post, this, [message, options ?? []]);
    };
  });
  await page.goto('/'); await chooseAudio(page, input);
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'waveformRequests')), { timeout: 45000 }).toBe(1);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Generate audio waveforms automatically' }).uncheck();
  await page.getByRole('button', { name: 'Back to workspace' }).click();
  await expect(page.getByRole('button', { name: 'Retry waveform' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancel waveform' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Generate audio waveforms automatically' }).check();
  await page.getByRole('button', { name: 'Back to workspace' }).click();
  await expect(page.getByRole('img', { name: 'Audio waveform', exact: true })).toBeVisible({ timeout: 45000 });
  expect(await page.evaluate(() => Reflect.get(window, 'waveformRequests'))).toBe(2);
});
