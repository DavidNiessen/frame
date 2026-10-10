import { closeEffect, openEffect } from '../helpers/effects';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ffmpegPath } from '../../electron/native';
const ffmpeg = ffmpegPath();
const exec = promisify(execFile);

async function captions(page: Page) {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample' }).click();
  await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click();
  await openEffect(page, 'Captions');
  await page.getByRole('button', { name: 'Add caption', exact: true }).click();
  await page.getByRole('button', { name: 'Move caption 1', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function drag(page: Page, dx: number, dy: number) {
  const caption = page.getByRole('button', { name: 'Move caption 1', exact: true });
  const box = (await caption.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 12 });
}

test('moves captions with one undo per drag, keyboard nudges and saved project placement', async ({ page }) => {
  await captions(page);
  const caption = page.getByRole('button', { name: 'Move caption 1', exact: true });
  const initial = (await caption.boundingBox())!;
  await drag(page, 60, -60); await page.mouse.up();
  const moved = (await caption.boundingBox())!;
  expect(moved.x - initial.x).toBeCloseTo(60, 0); expect(moved.y - initial.y).toBeCloseTo(-60, 0);
  await expect(page.getByRole('button', { name: 'Reset caption 1 position' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await expect(caption).not.toHaveClass(/positioned/);
  await page.getByRole('button', { name: 'Redo edit', exact: true }).click();
  await expect(caption).toHaveClass(/positioned/);
  await caption.focus(); await caption.press('Shift+ArrowUp');
  const y = await caption.evaluate(node => Number.parseFloat((node as HTMLElement).style.top));
  await drag(page, -30, -30); await page.keyboard.press('Escape'); await page.mouse.up();
  expect(await caption.evaluate(node => Number.parseFloat((node as HTMLElement).style.top))).toBe(y);
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  expect(await caption.evaluate(node => Number.parseFloat((node as HTMLElement).style.top))).toBeCloseTo(y + 5, 1);
  const saved = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const project = JSON.parse(await readFile((await (await saved).path())!, 'utf8'));
  const position = project.sources[0].edit.subtitles.cues[0].position;
  expect(position.x).toBeGreaterThan(50); expect(position.y).toBeLessThan(92);
  await expect(page.getByLabel('Autosave status')).toHaveText('Workspace autosaved');
  await page.reload(); await page.getByRole('button', { name: 'Try a sample' }).click();
  await page.getByRole('button', { name: 'Recover workspace' }).click();
  await page.getByRole('button', { name: 'Restore edits' }).click();
  await expect(caption).toHaveClass(/positioned/);
  expect(await caption.evaluate(node => Number.parseFloat((node as HTMLElement).style.top))).toBe(position.y);
  await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click();
  await openEffect(page, 'Captions');
  await page.getByRole('button', { name: 'Reset caption 1 position' }).click();
  await expect(caption).not.toHaveClass(/positioned/);
  await page.getByLabel('Subtitle export').selectOption('embed'); await expect(caption).toBeDisabled();
});

test('supports touch placement, clamps captions inside the frame and cancels interrupted gestures', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, baseURL });
  const page = await context.newPage();
  try {
    await captions(page);
    const caption = page.getByRole('button', { name: 'Move caption 1', exact: true });
    await caption.scrollIntoViewIfNeeded();
    const b = (await caption.boundingBox())!, x = b.x + b.width / 2, y = b.y + b.height / 2;
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 70, y: y - 50 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(caption).toHaveClass(/positioned/);
    const p = (await caption.boundingBox())!, cx = p.x + p.width / 2, cy = p.y + p.height / 2;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + 80, y: cy + 30 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    expect((await caption.boundingBox())!.x).toBeCloseTo(p.x, 0);
    await drag(page, -1000, -1000); await page.mouse.up();
    const clamped = (await caption.boundingBox())!, frame = (await page.locator('.caption-preview').boundingBox())!;
    expect(clamped.x).toBeGreaterThanOrEqual(frame.x - 1); expect(clamped.y).toBeGreaterThanOrEqual(frame.y - 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
});

test('burns the moved caption at the selected position with browser FFmpeg', async ({ page }, testInfo) => {
  const input = testInfo.outputPath('black.mp4');
  await exec(ffmpeg!, ['-y', '-f', 'lavfi', '-i', 'color=black:s=360x240:d=0.5', input]);
  await page.goto('/'); await page.getByLabel('Choose media files').setInputFiles(input);
  await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click();
  await openEffect(page, 'Captions');
  await page.getByRole('button', { name: 'Add caption', exact: true }).click();
  await page.getByLabel('Subtitle 1 text').fill('PLACED');
  await page.evaluate(() => document.fonts.ready);
  const frame = (await page.locator('.caption-preview').boundingBox())!;
  await drag(page, -frame.width * .25, -frame.height * .6); await page.mouse.up();
  const caption = page.getByRole('button', { name: 'Move caption 1', exact: true });
  const position = await caption.evaluate(node => ({ x: Number.parseFloat((node as HTMLElement).style.left), y: Number.parseFloat((node as HTMLElement).style.top) }));
  await closeEffect(page); await page.getByRole('button', { name: 'Export MP4', exact: true }).click();
  await expect(caption).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Save file' })).toBeVisible({ timeout: 45000 });
  const download = page.waitForEvent('download'); await page.getByRole('link', { name: 'Save file' }).click();
  const output = testInfo.outputPath('positioned.mp4'); await (await download).saveAs(output);
  const { stdout: pixels } = await exec(ffmpeg!, ['-v', 'error', '-i', output, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer', maxBuffer: 2_000_000 });
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < pixels.length; i += 3) if (pixels[i] > 200 && pixels[i + 1] > 200 && pixels[i + 2] > 200) { xs.push(i / 3 % 360); ys.push(Math.floor(i / 3 / 360)); }
  expect(xs.length).toBeGreaterThan(30);
  expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(360 * position.x / 100, -1);
  expect(Math.max(...ys)).toBeGreaterThan(240 * position.y / 100 - 8);
  expect(Math.max(...ys)).toBeLessThanOrEqual(240 * position.y / 100);
});
