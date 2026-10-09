import { test, expect, type Page } from '@playwright/test';

const position = (page: Page) => page.evaluate(() => ({
  x: parseFloat((document.querySelector('.app-header') as HTMLElement).style.getPropertyValue('--border-light-x') || '25'),
  y: parseFloat((document.querySelector('.app-header') as HTMLElement).style.getPropertyValue('--border-light-y') || '15'),
}));

test('border light eases in the opposite direction to the cursor without blocking controls', async ({ page }) => {
  await page.goto('/');
  await page.mouse.move(144, 100);
  await expect.poll(async () => (await position(page)).x).toBeCloseTo(90, 0);
  await expect.poll(async () => (await position(page)).y).toBeCloseTo(90, 0);
  await page.mouse.move(1296, 900);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const moving = await position(page);
  expect(moving.x).toBeGreaterThan(10); expect(moving.x).toBeLessThan(90);
  expect(moving.y).toBeGreaterThan(10); expect(moving.y).toBeLessThan(90);
  await expect.poll(async () => (await position(page)).x).toBeCloseTo(10, 0);
  await expect.poll(async () => (await position(page)).y).toBeCloseTo(10, 0);
  await expect(page.locator('.app-header')).toHaveCSS('position', 'relative');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
});

test('reduced motion leaves the border light static, including when changed at runtime', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
  await page.mouse.move(1296, 900);
  expect(await position(page)).toEqual({ x: 25, y: 15 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.mouse.move(144, 100);
  await expect.poll(async () => (await position(page)).x).toBeGreaterThan(50);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => position(page)).toEqual({ x: 25, y: 15 });
});

test('touch devices retain static borders and normal taps', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage(); await page.goto('/');
    await page.getByRole('button', { name: 'Settings', exact: true }).tap();
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    expect(await position(page)).toEqual({ x: 25, y: 15 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
});
