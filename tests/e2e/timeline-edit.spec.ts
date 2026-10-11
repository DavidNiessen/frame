import { importTestMedia } from '../helpers/import-media';
import { closeEffect, openEffect, openCaptionTools } from '../helpers/effects';
import { test, expect, type Page } from '@playwright/test';
import { setBoundary } from '../helpers/timeline';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ffmpegPath } from '../../electron/native';
async function dragEdge(page: Page, label: string, delta: number) {
  const handle = page.getByRole('slider', { name: label, exact: true });
  await handle.scrollIntoViewIfNeeded();
  const bounds = (await handle.boundingBox())!;
  const lane = await handle.evaluate(
    (node) => node.closest('.timeline-lane')!.getBoundingClientRect().width,
  );
  const scale = await handle.evaluate((node) => {
    const range = node.closest<HTMLElement>('.timeline-range')!;
    return Number(range.dataset.duration) * Number(range.dataset.speed);
  });
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + (delta / scale) * lane,
    bounds.y + bounds.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();
}
async function sample(page: Page) {
  await page.goto('/');
  await importTestMedia(page);
  await page.getByRole('slider', { name: 'Trim start', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}
test('drags, restores, and independently resizes split clips with one undo per gesture', async ({
  page,
}) => {
  await sample(page);
  await expect(page.getByRole('spinbutton', { name: /Trim start|Trim end/ })).toHaveCount(0);
  await dragEdge(page, 'Trim start', 1);
  await expect(page.getByLabel('Trim start', { exact: true })).toHaveAttribute(
    'aria-valuenow',
    '1',
  );
  await dragEdge(page, 'Trim end', -1);
  await expect(page.getByLabel('Trim end', { exact: true })).toHaveAttribute('aria-valuenow', '5');
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await expect(page.getByLabel('Trim end', { exact: true })).toHaveAttribute('aria-valuenow', '6');
  await expect(page.getByLabel('Trim start', { exact: true })).toHaveAttribute(
    'aria-valuenow',
    '1',
  );
  await page.getByRole('button', { name: 'Redo edit', exact: true }).click();
  await dragEdge(page, 'Trim start', -1);
  await dragEdge(page, 'Trim end', 1);
  await page.getByLabel('Seek playhead').fill('3');
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await dragEdge(page, 'Section 1 end', -1);
  await dragEdge(page, 'Section 2 start', 1);
  await expect(page.getByLabel('Section 1 end')).toHaveAttribute('aria-valuenow', '2');
  await expect(page.getByLabel('Section 2 start')).toHaveAttribute('aria-valuenow', '4');
  await dragEdge(page, 'Section 1 end', 1);
  await dragEdge(page, 'Section 2 start', -1);
  await expect(page.getByLabel('Section 1 end')).toHaveAttribute('aria-valuenow', '3');
  await expect(page.getByLabel('Section 2 start')).toHaveAttribute('aria-valuenow', '3');
  await dragEdge(page, 'Section 1 end', 2);
  await expect(page.getByLabel('Section 1 end')).toHaveAttribute('aria-valuenow', '3');
});
test('resizes overlapping captions and fades above the clip and preserves exported cue timing', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await sample(page);
  await closeEffect(page);
  await page.getByRole('tab', { name: 'Effects', exact: true }).click();
  await openCaptionTools(page);
  await page
    .getByLabel('Import subtitle file')
    .setInputFiles({
      name: 'timing.srt',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        '1\n00:00:00,000 --> 00:00:03,000\nFirst caption\n\n2\n00:00:01,000 --> 00:00:04,000\nOverlapping caption\n',
      ),
    });
  await expect(page.locator('.caption-lane')).toHaveCount(2);
  await expect(page.getByRole('spinbutton', { name: /Subtitle .* (start|end)/ })).toHaveCount(0);
  await dragEdge(page, 'Caption 1 start', 0.5);
  await dragEdge(page, 'Caption 1 end', -1);
  await expect(page.getByLabel('Caption 1 start')).toHaveAttribute('aria-valuenow', '0.5');
  await expect(page.getByLabel('Caption 1 end')).toHaveAttribute('aria-valuenow', '2');
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await expect(page.getByLabel('Caption 1 end')).toHaveAttribute('aria-valuenow', '3');
  await page.getByRole('button', { name: 'Redo edit', exact: true }).click();
  await page.locator('.timeline-lane-group > summary').filter({ hasText: 'Captions' }).click();
  await expect(page.getByLabel('Caption 1 start')).toBeHidden();
  await page.locator('.timeline-lane-group > summary').filter({ hasText: 'Captions' }).click();
  await openEffect(page, 'Audio fade in');
  await dragEdge(page, 'Audio fade in effect end', 0.5);
  await expect
    .poll(async () =>
      Number(await page.getByLabel('Audio fade in effect end').getAttribute('aria-valuenow')),
    )
    .toBeCloseTo(1, 6);
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await expect(page.getByLabel('Audio fade in effect end')).toHaveAttribute('aria-valuenow', '0.5');
  const downloadPromise = page.waitForEvent('download');
  await openCaptionTools(page);
  await page.getByRole('button', { name: 'Save output SRT' }).click();
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
  await page.mouse.move(bounds.x + 5, bounds.y + 10);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 40, bounds.y + 10);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(handle).toHaveAttribute('aria-valuenow', '0.5');
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await expect(page.getByLabel('Trim end', { exact: true })).toHaveAttribute('aria-valuenow', '5');
});
test('resizes clip edges with touch and cancels interrupted touch gestures', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    baseURL,
  });
  const page = await context.newPage();
  try {
    await sample(page);
    const handle = page.getByRole('slider', { name: 'Trim start', exact: true });
    await handle.scrollIntoViewIfNeeded();
    const bounds = (await handle.boundingBox())!;
    const width = await handle.evaluate(
      (node) => node.closest('.timeline-lane')!.getBoundingClientRect().width,
    );
    const session = await context.newCDPSession(page);
    const x = bounds.x + bounds.width / 2,
      y = bounds.y + bounds.height / 2;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + width / 6, y }],
    });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(handle).toHaveAttribute('aria-valuenow', '1');
    const updated = (await handle.boundingBox())!,
      nextX = updated.x + updated.width / 2;
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: nextX, y }],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: nextX + width / 6, y }],
    });
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(handle).toHaveAttribute('aria-valuenow', '1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await context.close();
  }
});
test('expands a trimmed end with small pointer movements instead of snapping back to itself', async ({
  page,
}) => {
  await sample(page);
  await setBoundary(page, 'Trim end', 3);
  const end = page.getByRole('slider', { name: 'Trim end', exact: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = Number(await end.getAttribute('aria-valuenow')),
      box = (await end.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 4, box.y + box.height / 2);
    await page.mouse.up();
    expect(Number(await end.getAttribute('aria-valuenow'))).toBeGreaterThan(before);
  }
});
test('quietly clamps source boundaries after trimming and restores with the left handle', async ({
  page,
}) => {
  await sample(page);
  await dragEdge(page, 'Trim start', 1);
  await dragEdge(page, 'Trim end', 1);
  await expect(
    page.getByRole('status').filter({ hasText: /source reached|source footage/ }),
  ).toHaveCount(0);
  await expect(page.getByLabel('Trim end', { exact: true })).toHaveAttribute('aria-valuenow', '6');
  await dragEdge(page, 'Trim start', -1);
  await expect(page.getByLabel('Trim start', { exact: true })).toHaveAttribute(
    'aria-valuenow',
    '0',
  );
});
test('restores the end of a very short retained clip on a long video', async ({ page }, info) => {
  const source = info.outputPath('long.mp4');
  await promisify(execFile)(ffmpegPath()!, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=black:s=64x64:r=1:d=3600',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    source,
  ]);
  await page.goto('/');
  await expect(page.getByLabel('Autosave status')).toHaveText('Autosave ready');
  await page.getByLabel('Choose media files').setInputFiles(source);
  const end = page.getByRole('slider', { name: 'Trim end', exact: true });
  await end.press('Home');
  await expect(end).toHaveAttribute('aria-valuenow', '0.05');
  const box = (await end.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(16);
  const start = (await page.getByLabel('Trim start', { exact: true }).boundingBox())!;
  expect(start.x + start.width).toBeLessThanOrEqual(box.x);
  expect(
    await page.evaluate(
      ({ x, y }) =>
        document.elementFromPoint(x, y)?.closest('[role="slider"]')?.getAttribute('aria-label'),
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    ),
  ).toBe('Trim end');
  await dragEdge(page, 'Trim end', 60);
  expect(Number(await end.getAttribute('aria-valuenow'))).toBeGreaterThan(59);
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await expect(end).toHaveAttribute('aria-valuenow', '0.05');
  const snap = page.getByRole('button', { name: 'Timeline snapping', exact: true });
  if ((await snap.getAttribute('aria-pressed')) !== 'true') await snap.click();
  const before = Number(await end.getAttribute('aria-valuenow'));
  await dragEdge(page, 'Trim end', 15); // About four pixels: the opposite edge must not trap it.
  expect(Number(await end.getAttribute('aria-valuenow'))).toBeGreaterThan(before);
});
