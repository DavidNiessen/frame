import { expect, test, type Page } from '@playwright/test';
import { closeEffect, openEffect, selectFont, openCaptionTools } from '../helpers/effects';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ffmpegPath } from '../../electron/native';
const exec = promisify(execFile);
async function sample(page: Page) {
  await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample', exact: true }).click();
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
}
async function pointerDrag(page: Page, label: string, dx: number, dy = 0) {
  const target = page.getByRole('button', { name: label, exact: true }); await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!; await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 });
}
for (const width of [1440, 390]) test(`selects, edits and resizes a caption in the preview at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 }); await sample(page); await openEffect(page, 'Captions'); await closeEffect(page);
  const caption = page.getByRole('button', { name: 'Move caption 1', exact: true }), overlay = page.locator('.effect-settings-overlay');
  await caption.click(); await expect(overlay).toHaveCount(1); await expect(overlay.getByRole('heading', { name: 'Caption settings', exact: true })).toHaveCount(1);
  await caption.dblclick(); const text = page.getByLabel('Edit Move caption 1 text in preview'); await text.fill('Inline caption'); await text.press('Space');
  await expect(page.locator('video')).toHaveJSProperty('paused', true); await text.press('Enter'); await expect(caption).toHaveText('Inline caption ');
  await caption.dblclick(); await text.fill('Discard this'); await text.press('Escape'); await expect(caption).toHaveText('Inline caption ');
  await pointerDrag(page, 'Resize Move caption 1 nw', -45, -25); await page.mouse.up(); await expect(overlay).toHaveCount(1);
  const object = page.locator('.caption-position'), after = await object.evaluate(node => parseFloat(getComputedStyle(node).fontSize));
  await closeEffect(page); await page.getByRole('button', { name: 'Undo edit', exact: true }).click(); const before = await object.evaluate(node => parseFloat(getComputedStyle(node).fontSize)); expect(after).toBeGreaterThan(before);
  await page.getByRole('button', { name: 'Redo edit', exact: true }).click(); await caption.click();
  if (width === 390) await page.locator('#media-inspector').scrollIntoViewIfNeeded();
  await page.getByRole('combobox', { name: 'Font', exact: true }).fill('Ser'); await expect(page.getByRole('option', { name: 'Serif', exact: true })).toBeVisible(); await page.getByRole('combobox', { name: 'Font', exact: true }).press('Enter');
  await expect(page.getByRole('combobox', { name: 'Font', exact: true })).toHaveValue('Serif'); await expect(page.getByLabel('Search installed fonts')).toHaveCount(0);
  await selectFont(page, 'Monospace'); await expect(page.getByRole('combobox', { name: 'Font', exact: true })).toHaveValue('Monospace');
  await expect(page.getByRole('button', { name: 'Reset caption position', exact: true })).toBeVisible(); await page.screenshot({ path: info.outputPath(`preview-edit-${width}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('moves a whole caption without shortening it, opens settings during drag and retains settings during trim', async ({ page }) => {
  await sample(page); await openCaptionTools(page); await page.getByLabel('Import subtitle file').setInputFiles({ name: 'one.srt', mimeType: 'text/plain', buffer: Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nMove me') });
  await page.getByRole('button', { name: 'Timeline snapping', exact: true }).click();
  const start = page.getByLabel('Caption 1 start', { exact: true }), end = page.getByLabel('Caption 1 end', { exact: true }), overlay = page.locator('.effect-settings-overlay');
  const original = Number(await end.getAttribute('aria-valuenow')) - Number(await start.getAttribute('aria-valuenow'));
  await pointerDrag(page, 'Caption 1', 80); await expect(overlay).toHaveCount(1); await page.mouse.up();
  expect(Number(await start.getAttribute('aria-valuenow'))).toBeGreaterThan(1); expect(Number(await end.getAttribute('aria-valuenow')) - Number(await start.getAttribute('aria-valuenow'))).toBeCloseTo(original);
  await closeEffect(page); const handle = (await end.boundingBox())!; await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down(); await expect(overlay).toHaveCount(1); await page.mouse.move(handle.x + handle.width / 2 + 20, handle.y + handle.height / 2); await page.mouse.up(); await expect(overlay).toHaveCount(1);
  const saved = await start.getAttribute('aria-valuenow'); await pointerDrag(page, 'Caption 1', -50); await page.keyboard.press('Escape'); await page.mouse.up(); await expect(start).toHaveAttribute('aria-valuenow', saved!);
});
test('keeps grab handles usable on a one-hour timeline', async ({ page }, info) => {
  const input = info.outputPath('hour.mp4'); await exec(ffmpegPath()!, ['-y', '-f', 'lavfi', '-i', 'color=black:s=64x64:r=1:d=3600', '-c:v', 'libx264', '-preset', 'ultrafast', input]);
  await page.goto('/'); await expect(page.getByLabel('Autosave status')).toHaveText('Autosave ready'); await page.getByLabel('Choose media files').setInputFiles(input); await openEffect(page, 'Captions'); await closeEffect(page);
  const start = page.getByLabel('Caption 1 start', { exact: true }), end = page.getByLabel('Caption 1 end', { exact: true });
  const a = (await start.boundingBox())!, b = (await end.boundingBox())!; expect(a.width).toBeGreaterThanOrEqual(16); expect(b.width).toBeGreaterThanOrEqual(16); expect(a.x + a.width).toBeLessThanOrEqual(b.x);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.move(b.x + b.width / 2 + 30, b.y + b.height / 2); await page.mouse.up();
  expect(Number(await end.getAttribute('aria-valuenow'))).toBeGreaterThan(2); await expect(page.locator('.effect-settings-overlay')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Add timeline marker', exact: true })).toHaveCount(0); await expect(page.locator('.timeline-overview')).toBeVisible();
});
test('Space always plays from focused buttons and messages expire after five seconds', async ({ page }) => {
  await sample(page); const compact = page.getByRole('button', { name: 'Compact', exact: true }); await compact.focus(); const value = await compact.getAttribute('aria-pressed'); await compact.press('Space'); await expect(page.locator('video')).toHaveJSProperty('paused', false); await compact.press('Space'); await expect(page.locator('video')).toHaveJSProperty('paused', true); await expect(compact).toHaveAttribute('aria-pressed', value!);
  await page.clock.install({ time: new Date('2026-10-10T10:00:00Z') }); await page.clock.pauseAt(new Date('2026-10-10T10:00:01Z'));
  await openEffect(page, 'Volume'); await closeEffect(page); await page.getByRole('button', { name: 'Add Volume', exact: true }).click(); const note = page.locator('.effect-apply-message'); await expect(note).toBeVisible(); await expect(note.locator('.message-countdown')).toHaveCount(1);
  await page.clock.fastForward(4999); await expect(note).toBeVisible(); await page.clock.fastForward(2); await expect(note).toHaveCount(0);
});
test('selects and edits watermark text and resizes a watermark image directly', async ({ page }) => {
  await sample(page); await openEffect(page, 'Watermark'); await page.getByLabel('Overlay text', { exact: true }).fill('Watermark');
  const png = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64; canvas.getContext('2d')!.fillRect(0, 0, 64, 64); return canvas.toDataURL().split(',')[1]; });
  await page.getByLabel('Watermark image file').setInputFiles({ name: 'mark.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }); await expect(page.getByAltText('Watermark preview')).toBeVisible(); await closeEffect(page);
  const text = page.getByRole('button', { name: 'Move watermark 1 text', exact: true }); await text.click(); await expect(page.locator('.effect-settings-overlay')).toHaveCount(1); await text.dblclick(); await page.getByLabel('Edit Move watermark 1 text in preview').fill('Edited watermark'); await page.getByLabel('Edit Move watermark 1 text in preview').press('Enter'); await expect(text).toHaveText('Edited watermark');
  const image = page.getByRole('button', { name: 'Move watermark 1 image', exact: true }); await image.click(); const before = (await image.boundingBox())!.width; await pointerDrag(page, 'Resize Move watermark 1 image nw', -30, -30); await page.mouse.up(); expect((await image.boundingBox())!.width).toBeGreaterThan(before); await expect(page.locator('.effect-settings-overlay')).toHaveCount(1);
});
