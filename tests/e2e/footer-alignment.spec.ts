import { test, expect } from '@playwright/test';

test('centers keyboard shortcuts in the whole status island on desktop and phones', async ({
  page,
}) => {
  await page.goto('/');
  const footer = page.getByRole('contentinfo', { name: 'Workspace status' });
  const button = footer.getByRole('button', { name: 'Keyboard shortcuts', exact: true });
  await expect(button).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport();
    await expect
      .poll(async () => {
        const island = await footer.boundingBox(),
          shortcuts = await button.boundingBox();
        return Math.abs(island!.x + island!.width / 2 - shortcuts!.x - shortcuts!.width / 2);
      })
      .toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
