import { test, expect, type Page } from '@playwright/test';

async function sample(page: Page) {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample', exact: true }).click();
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4, { timeout: 45000 });
  await page.evaluate(() => document.fonts.ready);
}
async function crowdedTimeline(page: Page) {
  await page.getByRole('tab', { name: 'Effects', exact: true }).click();
  await page.getByText('Subtitles', { exact: true }).click();
  const srt = Array.from({ length: 40 }, (_, index) => `${index + 1}\n00:00:00,500 --> 00:00:05,500\nCaption ${index + 1}\n`).join('\n');
  await page.getByLabel('Import subtitle file').setInputFiles({ name: 'crowded.srt', mimeType: 'text/plain', buffer: Buffer.from(srt) });
  await expect(page.locator('.caption-lane')).toHaveCount(40);
}
async function dragDivider(page: Page, name: string, x: number, y: number) {
  const divider = page.getByRole('separator', { name, exact: true });
  const bounds = (await divider.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width / 2 + x, bounds.y + bounds.height / 2 + y, { steps: 8 }); await page.mouse.up();
}
test('bounds a crowded timeline without shrinking the preview and scrolls zoomed tracks', async ({ page }) => {
  await sample(page);
  const before = (await page.locator('.preview-panel').boundingBox())!;
  const video = (await page.locator('video').boundingBox())!;
  await crowdedTimeline(page);
  expect((await page.locator('.preview-panel').boundingBox())!.height).toBeCloseTo(before.height, 0);
  expect((await page.locator('video').boundingBox())!.height).toBeCloseTo(video.height, 0);
  const tracks = page.getByRole('region', { name: 'Timeline tracks', exact: true });
  expect(await tracks.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  expect((await page.locator('.timeline').boundingBox())!.height).toBe(248);
  await page.getByLabel('Trim start', { exact: true }).scrollIntoViewIfNeeded();
  expect(await tracks.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  await page.getByLabel('Timeline zoom', { exact: true }).fill('4');
  expect(await tracks.evaluate(node => node.scrollWidth > node.clientWidth * 3)).toBe(true);
  await page.getByLabel('Seek playhead').fill('4.5');
  await expect.poll(() => tracks.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
  await page.getByLabel('Trim end', { exact: true }).focus();
  await page.getByLabel('Trim end', { exact: true }).press('Shift+ArrowLeft');
  await expect(page.getByLabel('Trim end', { exact: true })).toHaveAttribute('aria-valuenow', '5.9');
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await expect(page.getByLabel('Timeline zoom')).toHaveValue('1');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.screenshot({ path: 'test-results/island-editor-crowded.png' });
});
test('resizes panels with pointer and keyboard, cancels gestures, remembers sizes and resets them', async ({ page }) => {
  await sample(page);
  await dragDivider(page, 'Resize media library', 70, 0);
  await expect(page.getByRole('separator', { name: 'Resize media library' })).toHaveAttribute('aria-valuenow', '290');
  await dragDivider(page, 'Resize edit and export panel', -60, 0);
  await expect(page.getByRole('separator', { name: 'Resize edit and export panel' })).toHaveAttribute('aria-valuenow', '380');
  const timeline = page.getByRole('separator', { name: 'Resize timeline', exact: true });
  await dragDivider(page, 'Resize timeline', 0, -70);
  await expect(timeline).toHaveAttribute('aria-valuenow', '318');
  await timeline.press('Shift+ArrowUp'); await expect(timeline).toHaveAttribute('aria-valuenow', '358');
  await timeline.press('End');
  expect((await page.locator('.preview-panel').boundingBox())!.height).toBeGreaterThanOrEqual(360);
  await timeline.dblclick(); await expect(timeline).toHaveAttribute('aria-valuenow', '248');
  const bounds = (await timeline.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y - 60); await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(timeline).toHaveAttribute('aria-valuenow', '248');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('frame:panel-layout:v1')!).library)).toBe(290);
  await page.reload();
  await expect(page.getByRole('separator', { name: 'Resize media library' })).toHaveAttribute('aria-valuenow', '290');
  await page.getByText('Project tools', { exact: true }).click();
  await page.getByRole('button', { name: 'Reset panel layout' }).click();
  await expect(page.getByRole('separator', { name: 'Resize media library' })).toHaveAttribute('aria-valuenow', '220');
  await expect(page.getByRole('separator', { name: 'Resize edit and export panel' })).toHaveAttribute('aria-valuenow', '320');
});
test('adapts oversized saved panels to tablet and phone, keeping timeline touch resizing independent', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, baseURL });
  const page = await context.newPage();
  try {
    await page.addInitScript(() => localStorage.setItem('frame:panel-layout:v1', JSON.stringify({ library: 400, inspector: 480, timeline: 248 })));
    await sample(page); await crowdedTimeline(page);
    const before = (await page.locator('.preview-panel').boundingBox())!;
    const divider = page.getByRole('separator', { name: 'Resize timeline', exact: true }); await divider.scrollIntoViewIfNeeded();
    const bounds = (await divider.boundingBox())!, x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 80 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(divider).toHaveAttribute('aria-valuenow', '328');
    expect((await page.locator('.preview-panel').boundingBox())!.height).toBeCloseTo(before.height, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/island-editor-phone.png', fullPage: true });
    await page.setViewportSize({ width: 850, height: 1000 });
    await expect(page.locator('.editor-layout')).toHaveAttribute('data-layout', 'medium');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await page.locator('.preview-panel').boundingBox())!.height).toBeGreaterThanOrEqual(360);
    await page.setViewportSize({ width: 1440, height: 720 });
    await expect(page.locator('.editor-layout')).toHaveAttribute('data-layout', 'wide');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await page.locator('.preview-panel').boundingBox())!.height).toBeGreaterThanOrEqual(360);
  } finally { await context.close(); }
});
test('resizes conversion settings and stacks its islands on narrow screens', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Workflow' }).getByRole('button', { name: 'Convert', exact: true }).click();
  await dragDivider(page, 'Resize conversion settings', -80, 0);
  await expect(page.getByRole('separator', { name: 'Resize conversion settings' })).toHaveAttribute('aria-valuenow', '400');
  expect((await page.locator('.conversion-main').boundingBox())!.width).toBeGreaterThanOrEqual(400);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.resizable-conversion')).toHaveAttribute('data-layout', 'stacked');
  await expect(page.getByRole('separator', { name: 'Resize conversion settings' })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
