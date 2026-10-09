import { openEffect } from '../helpers/effects';
import { test, expect, type Page } from '@playwright/test';
import { setBoundary } from '../helpers/timeline';
async function dragEdge(page: Page, label: string, delta: number) {
  const handle = page.getByRole('slider', { name: label, exact: true });
  await handle.scrollIntoViewIfNeeded();
  const bounds = (await handle.boundingBox())!;
  const lane = await handle.evaluate(node => node.closest('.timeline-lane')!.getBoundingClientRect().width);
  const scale = await handle.evaluate(node => { const range = node.closest<HTMLElement>('.timeline-range')!; return Number(range.dataset.duration) * Number(range.dataset.speed); });
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + delta / scale * lane, bounds.y + bounds.height / 2, { steps: 12 });
  await page.mouse.up();
}
async function sample(page: Page) {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample' }).click();
  await page.getByRole('slider', { name: 'Trim start', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}
test('drags, restores, and independently resizes split clips with one undo per gesture', async ({ page }) => {
  await sample(page);
  await expect(page.getByRole('spinbutton', { name: /Trim start|Trim end/ })).toHaveCount(0);
  await dragEdge(page, 'Trim start', 1);
  await expect(page.getByLabel('Trim start', { exact: true })).toHaveAttribute('aria-valuenow', '1');
  await dragEdge(page, 'Trim end', -1);
  await expect(page.getByLabel('Trim end', { exact: true })).toHaveAttribute('aria-valuenow', '5');
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await expect(page.getByLabel('Trim end', { exact: true })).toHaveAttribute('aria-valuenow', '6');
  await expect(page.getByLabel('Trim start', { exact: true })).toHaveAttribute('aria-valuenow', '1');
  await page.getByRole('button', { name: 'Redo edit', exact: true }).click();
  await dragEdge(page, 'Trim start', -1); await dragEdge(page, 'Trim end', 1);
  await page.getByLabel('Seek playhead').fill('3');
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await dragEdge(page, 'Section 1 end', -1); await dragEdge(page, 'Section 2 start', 1);
  await expect(page.getByLabel('Section 1 end')).toHaveAttribute('aria-valuenow', '2');
  await expect(page.getByLabel('Section 2 start')).toHaveAttribute('aria-valuenow', '4');
  await dragEdge(page, 'Section 1 end', 1); await dragEdge(page, 'Section 2 start', -1);
  await expect(page.getByLabel('Section 1 end')).toHaveAttribute('aria-valuenow', '3');
  await expect(page.getByLabel('Section 2 start')).toHaveAttribute('aria-valuenow', '3');
  await dragEdge(page, 'Section 1 end', 2);
  await expect(page.getByLabel('Section 1 end')).toHaveAttribute('aria-valuenow', '3');
});
test('resizes overlapping captions and fades above the clip and preserves exported cue timing', async ({ page }) => {
  await sample(page);
  await page.getByRole('tab', { name: 'Effects', exact: true }).click();
  await openEffect(page, 'Captions');
  await page.getByLabel('Import subtitle file').setInputFiles({ name: 'timing.srt', mimeType: 'text/plain', buffer: Buffer.from('1\n00:00:00,000 --> 00:00:03,000\nFirst caption\n\n2\n00:00:01,000 --> 00:00:04,000\nOverlapping caption\n') });
  await expect(page.locator('.caption-lane')).toHaveCount(2);
  await expect(page.getByRole('spinbutton', { name: /Subtitle .* (start|end)/ })).toHaveCount(0);
  await dragEdge(page, 'Caption 1 start', 0.5); await dragEdge(page, 'Caption 1 end', -1);
  await expect(page.getByLabel('Caption 1 start')).toHaveAttribute('aria-valuenow', '0.5');
  await expect(page.getByLabel('Caption 1 end')).toHaveAttribute('aria-valuenow', '2');
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await expect(page.getByLabel('Caption 1 end')).toHaveAttribute('aria-valuenow', '3');
  await page.getByRole('button', { name: 'Redo edit', exact: true }).click();
  await page.locator('.timeline-lane-group > summary').filter({ hasText: 'Captions' }).click();
  await expect(page.getByLabel('Caption 1 start')).toBeHidden();
  await page.locator('.timeline-lane-group > summary').filter({ hasText: 'Captions' }).click();
  await openEffect(page, 'Audio fade in');
  await dragEdge(page, 'Audio fade in end', 0.5);
  await expect(page.getByLabel('Audio fade in end')).toHaveAttribute('aria-valuenow', '1');
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await expect(page.getByLabel('Audio fade in end')).toHaveAttribute('aria-valuenow', '0.5');
  const downloadPromise = page.waitForEvent('download');
  await openEffect(page, 'Captions'); await page.getByRole('button', { name: 'Save output SRT' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const { readFile } = await import('node:fs/promises');
  expect(await readFile(path!, 'utf8')).toContain('00:00:00,500 --> 00:00:02,000');
});
test('supports keyboard resizing and cancelling a pointer gesture', async ({ page }) => {
  await sample(page);
  await setBoundary(page, 'Trim start', 0.5);
  await setBoundary(page, 'Trim end', 4);
  const handle = page.getByRole('slider', { name: 'Trim start', exact: true });
  const bounds = (await handle.boundingBox())!;
  await page.mouse.move(bounds.x + 5, bounds.y + 10); await page.mouse.down();
  await page.mouse.move(bounds.x + 40, bounds.y + 10);
  await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(handle).toHaveAttribute('aria-valuenow', '0.5');
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await expect(page.getByLabel('Trim end', { exact: true })).toHaveAttribute('aria-valuenow', '5');
});
test('resizes clip edges with touch and cancels interrupted touch gestures', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, baseURL });
  const page = await context.newPage();
  try {
    await sample(page);
    const handle = page.getByRole('slider', { name: 'Trim start', exact: true });
    await handle.scrollIntoViewIfNeeded();
    const bounds = (await handle.boundingBox())!;
    const width = await handle.evaluate(node => node.closest('.timeline-lane')!.getBoundingClientRect().width);
    const session = await context.newCDPSession(page);
    const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + width / 6, y }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(handle).toHaveAttribute('aria-valuenow', '1');
    const updated = (await handle.boundingBox())!, nextX = updated.x + updated.width / 2;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: nextX, y }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: nextX + width / 6, y }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(handle).toHaveAttribute('aria-valuenow', '1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
});
