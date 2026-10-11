import { importTestMedia } from '../helpers/import-media';
import { closeEffect, openCaptionTools } from '../helpers/effects';
import { test, expect, type Page } from '@playwright/test';

async function sample(page: Page) {
  await page.goto('/');
  await importTestMedia(page);
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4, { timeout: 45000 });
  await page.evaluate(() => document.fonts.ready);
}
async function crowdedTimeline(page: Page) {
  await closeEffect(page);
  await page.getByRole('tab', { name: 'Effects', exact: true }).click();
  await openCaptionTools(page);
  const srt = Array.from(
    { length: 40 },
    (_, index) => `${index + 1}\n00:00:00,500 --> 00:00:05,500\nCaption ${index + 1}\n`,
  ).join('\n');
  await page
    .getByLabel('Import subtitle file')
    .setInputFiles({ name: 'crowded.srt', mimeType: 'text/plain', buffer: Buffer.from(srt) });
  await expect(page.locator('.caption-lane')).toHaveCount(40);
}
async function dragDivider(page: Page, name: string, x: number, y: number) {
  const divider = page.getByRole('separator', { name, exact: true });
  const bounds = (await divider.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await expect(divider).toHaveCSS('outline-style', 'none');
  await expect(divider.locator('span')).toHaveCSS('box-shadow', 'none');
  await page.mouse.move(bounds.x + bounds.width / 2 + x, bounds.y + bounds.height / 2 + y, {
    steps: 8,
  });
  await page.mouse.up();
}
test('keeps short wide browser windows within the viewport and scrolls content inside panels', async ({
  page,
}) => {
  const contained = async () => {
    await expect
      .poll(() =>
        page.evaluate(() => ({
          horizontal: document.documentElement.scrollWidth - innerWidth,
          vertical: document.documentElement.scrollHeight - innerHeight,
        })),
      )
      .toEqual({ horizontal: 0, vertical: 0 });
    await expect(page.locator('.app-footer')).toBeInViewport();
  };
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto('/');
  for (const height of [700, 600, 500, 829]) {
    await page.setViewportSize({ width: 1440, height });
    await expect(page.locator('.editor-layout')).toHaveAttribute('data-layout', 'wide');
    await contained();
    await expect(page.getByRole('button', { name: 'Import media', exact: true })).toBeInViewport();
  }
  await sample(page);
  await crowdedTimeline(page);
  for (const height of [700, 600, 500, 829]) {
    await page.setViewportSize({ width: 1440, height });
    await contained();
    const tracks = page.getByRole('region', { name: 'Timeline tracks', exact: true });
    expect(await tracks.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
    await tracks.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await contained();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeInViewport();
  }
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  // Long pages must still scroll; only the wide editor uses panel-contained scrolling.
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
});

test('fits the empty preview at short desktop heights and contains genuine overflow inside its rounded border', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 829 });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const scroller = page.locator('.empty-stage-scroll');
  expect(await scroller.evaluate((node) => node.scrollHeight)).toBe(
    await scroller.evaluate((node) => node.clientHeight),
  );
  await page.getByRole('button', { name: 'Add media', exact: true }).scrollIntoViewIfNeeded();
  expect(await scroller.evaluate((node) => node.scrollTop)).toBe(0);
  await expect(page.locator('.empty-stage')).toHaveCSS('overflow', 'hidden');
  const panel = (await page.locator('.empty-stage').boundingBox())!,
    inner = (await scroller.boundingBox())!;
  expect(inner.x + inner.width).toBeLessThan(panel.x + panel.width - 6);
  const art = (await page.locator('.art-window').boundingBox())!,
    eyebrow = (await page.locator('.empty-stage .eyebrow').boundingBox())!;
  expect(art.y + art.height).toBeLessThan(eyebrow.y);
  await page.screenshot({ path: 'test-results/empty-preview-short.png' });
  // A narrow, short preview still scrolls rather than clipping the import actions.
  await page.getByRole('separator', { name: 'Resize media library' }).press('End');
  await page.getByRole('separator', { name: 'Resize edit and export panel' }).press('End');
  await expect(
    page.getByRole('button', { name: 'Import media', exact: true }).last(),
  ).toBeVisible();
});
test('bounds a crowded timeline without shrinking the preview and scrolls zoomed tracks', async ({
  page,
}) => {
  await sample(page);
  const before = (await page.locator('.preview-panel').boundingBox())!;
  const video = (await page.locator('video').boundingBox())!;
  await crowdedTimeline(page);
  expect((await page.locator('.preview-panel').boundingBox())!.height).toBeCloseTo(
    before.height,
    0,
  );
  expect((await page.locator('video').boundingBox())!.height).toBeCloseTo(video.height, 0);
  const tracks = page.getByRole('region', { name: 'Timeline tracks', exact: true });
  expect(await tracks.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  expect((await page.locator('.timeline').boundingBox())!.height).toBeCloseTo(before.height, 0);
  await page.getByLabel('Trim start', { exact: true }).scrollIntoViewIfNeeded();
  // Clip handles remain pinned and visible without scrolling past caption tracks.
  await expect(page.getByLabel('Trim start', { exact: true })).toBeInViewport();
  await page.getByLabel('Timeline zoom', { exact: true }).fill('4');
  expect(await tracks.evaluate((node) => node.scrollWidth > node.clientWidth * 3)).toBe(true);
  await page.getByLabel('Seek playhead').fill('4.5');
  await expect.poll(() => tracks.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  await page.getByLabel('Trim end', { exact: true }).focus();
  await page.getByLabel('Trim end', { exact: true }).press('Shift+ArrowLeft');
  await expect(page.getByLabel('Trim end', { exact: true })).toHaveAttribute(
    'aria-valuenow',
    '5.9',
  );
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await expect(page.getByLabel('Timeline zoom')).toHaveValue('1');
  await page.getByLabel('Seek playhead').fill('0');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.screenshot({ path: 'test-results/island-editor-crowded.png' });
});
test('resizes panels with pointer and keyboard, cancels gestures, remembers sizes and resets them', async ({
  page,
}) => {
  await sample(page);
  const defaultTimeline = Number(
    await page
      .getByRole('separator', { name: 'Resize timeline', exact: true })
      .getAttribute('aria-valuenow'),
  );
  await dragDivider(page, 'Resize media library', 70, 0);
  await expect(page.getByRole('separator', { name: 'Resize media library' })).toHaveAttribute(
    'aria-valuenow',
    '290',
  );
  await dragDivider(page, 'Resize edit and export panel', -60, 0);
  await expect(
    page.getByRole('separator', { name: 'Resize edit and export panel' }),
  ).toHaveAttribute('aria-valuenow', '380');
  const timeline = page.getByRole('separator', { name: 'Resize timeline', exact: true });
  await dragDivider(page, 'Resize timeline', 0, -70);
  await expect(timeline).toHaveAttribute('aria-valuenow', String(defaultTimeline + 70));
  await timeline.press('Shift+ArrowUp');
  await expect(timeline).toHaveAttribute('aria-valuenow', String(defaultTimeline + 110));
  expect(
    await timeline.locator('span').evaluate((node) => getComputedStyle(node).boxShadow),
  ).not.toBe('none');
  await timeline.press('End');
  expect((await page.locator('.preview-panel').boundingBox())!.height).toBeGreaterThanOrEqual(240);
  await timeline.dblclick();
  await expect(timeline).toHaveAttribute('aria-valuenow', String(defaultTimeline));
  const bounds = (await timeline.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y - 60);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(timeline).toHaveAttribute('aria-valuenow', String(defaultTimeline));
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('frame:panel-layout:v1')!).library),
    )
    .toBe(290);
  await page.reload();
  await expect(page.getByRole('separator', { name: 'Resize media library' })).toHaveAttribute(
    'aria-valuenow',
    '290',
  );
  await page.getByLabel('Project tools', { exact: true }).click();
  await page.getByRole('button', { name: 'Reset panel layout' }).click();
  await expect(page.getByRole('separator', { name: 'Resize media library' })).toHaveAttribute(
    'aria-valuenow',
    '220',
  );
  await expect(
    page.getByRole('separator', { name: 'Resize edit and export panel' }),
  ).toHaveAttribute('aria-valuenow', '320');
});
test('adapts oversized saved panels to tablet and phone, keeping timeline touch resizing independent', async ({
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
    await page.addInitScript(() =>
      localStorage.setItem(
        'frame:panel-layout:v1',
        JSON.stringify({ library: 400, inspector: 480, timeline: 248 }),
      ),
    );
    await sample(page);
    await crowdedTimeline(page);
    const before = (await page.locator('.preview-panel').boundingBox())!;
    const divider = page.getByRole('separator', { name: 'Resize timeline', exact: true });
    await divider.scrollIntoViewIfNeeded();
    const bounds = (await divider.boundingBox())!,
      x = bounds.x + bounds.width / 2,
      y = bounds.y + bounds.height / 2;
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y - 80 }],
    });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(divider).toHaveAttribute('aria-valuenow', '328');
    expect((await page.locator('.preview-panel').boundingBox())!.height).toBeCloseTo(
      before.height,
      0,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: 'test-results/island-editor-phone.png', fullPage: true });
    await page.setViewportSize({ width: 850, height: 1000 });
    await expect(page.locator('.editor-layout')).toHaveAttribute('data-layout', 'medium');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await page.locator('.preview-panel').boundingBox())!.height).toBeGreaterThanOrEqual(
      240,
    );
    await page.setViewportSize({ width: 1440, height: 720 });
    await expect(page.locator('.editor-layout')).toHaveAttribute('data-layout', 'wide');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await page.locator('.preview-panel').boundingBox())!.height).toBeGreaterThanOrEqual(
      240,
    );
  } finally {
    await context.close();
  }
});
test('resizes conversion settings and stacks its islands on narrow screens', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Workflow' })
    .getByRole('button', { name: 'Convert', exact: true })
    .click();
  await dragDivider(page, 'Resize conversion settings', -80, 0);
  await expect(page.getByRole('separator', { name: 'Resize conversion settings' })).toHaveAttribute(
    'aria-valuenow',
    '400',
  );
  expect((await page.locator('.conversion-main').boundingBox())!.width).toBeGreaterThanOrEqual(400);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.resizable-conversion')).toHaveAttribute('data-layout', 'stacked');
  await expect(page.getByRole('separator', { name: 'Resize conversion settings' })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
