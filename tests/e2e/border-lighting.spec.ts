import { test, expect, type Page } from '@playwright/test';

async function open(page: Page) {
  await page.goto('/');
  await expect.poll(() => page.locator('.app-header').evaluate(node => (node as HTMLElement).style.getPropertyValue('--border-light-x'))).toMatch(/px$/);
}

const position = (page: Page, selector = '.app-header') => page.locator(selector).evaluate(element => {
  const style = getComputedStyle(element, '::before'), bounds = element.getBoundingClientRect();
  return {
    x: (parseFloat(style.getPropertyValue('--border-light-x')) + bounds.left + element.clientLeft) / innerWidth * 100,
    y: (parseFloat(style.getPropertyValue('--border-light-y')) + bounds.top + element.clientTop) / innerHeight * 100,
  };
});

test('border light follows the cursor smoothly at one shared app position without blocking controls', async ({ page }) => {
  await open(page);
  await page.mouse.move(144, 100);
  await expect.poll(async () => (await position(page)).x).toBeCloseTo(10, 0);
  await expect.poll(async () => (await position(page)).y).toBeCloseTo(10, 0);
  await page.mouse.move(1296, 900);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const moving = await position(page);
  expect(moving.x).toBeGreaterThan(10); expect(moving.x).toBeLessThan(90);
  expect(moving.y).toBeGreaterThan(10); expect(moving.y).toBeLessThan(90);
  await expect.poll(async () => (await position(page)).x).toBeCloseTo(90, 0);
  await expect.poll(async () => (await position(page)).y).toBeCloseTo(90, 0);
  const glow = await position(page, '.empty-stage');
  expect(glow.x).toBeCloseTo(90, 0); expect(glow.y).toBeCloseTo(90, 0);
  expect(await page.locator('.empty-stage').evaluate(node => getComputedStyle(node, '::after').content)).toBe('none');
  await expect(page.locator('.app-header')).toHaveCSS('position', 'relative');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
});

test('reduced motion leaves the border light static, including when changed at runtime', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await open(page);
  await page.mouse.move(1296, 900);
  expect(await position(page)).toEqual({ x: 25, y: 15 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.mouse.move(1296, 900);
  await expect.poll(async () => (await position(page)).x).toBeGreaterThan(50);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(async () => (await position(page)).x).toBeCloseTo(25, 3);
  await expect.poll(async () => (await position(page)).y).toBeCloseTo(15, 3);
});

test('the shared light stays aligned across different panels when the workspace scrolls or resizes', async ({ page }) => {
  await open(page);
  await page.getByRole('navigation', { name: 'Workflow' }).getByRole('button', { name: 'Convert', exact: true }).click();
  await page.mouse.move(720, 400);
  await expect.poll(async () => (await position(page)).x).toBeCloseTo(50, 1);
  await expect.poll(async () => (await position(page)).y).toBeCloseTo(40, 1);
  for (const selector of ['.conversion-intro', '.conversion-settings', '.app-footer']) {
    const light = await position(page, selector);
    expect(light.x).toBeCloseTo(50, 1); expect(light.y).toBeCloseTo(40, 1);
  }
  await page.setViewportSize({ width: 1440, height: 650 });
  await page.mouse.move(720, 260);
  await page.evaluate(() => window.scrollTo(0, 200));
  for (const selector of ['.conversion-intro', '.conversion-settings', '.app-footer']) {
    await expect.poll(async () => (await position(page, selector)).x).toBeCloseTo(50, 1);
    await expect.poll(async () => (await position(page, selector)).y).toBeCloseTo(40, 1);
  }
});

test('touch devices retain static borders and normal taps', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage(); await open(page);
    await page.getByRole('button', { name: 'App menu', exact: true }).tap();
    await page.getByRole('button', { name: 'Settings', exact: true }).tap();
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    expect(await position(page)).toEqual({ x: 25, y: 15 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
});
