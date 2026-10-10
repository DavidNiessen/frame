import { expect, test } from '@playwright/test';
test('steps frames, pauses playback, and seeks precise sequence positions without editing the trim', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample', exact: true }).click();
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4, { timeout: 30000 });
  await page.getByRole('button', { name: 'Next frame', exact: true }).click();
  const first = await page.locator('video').evaluate((media: HTMLVideoElement) => media.currentTime);
  expect(first).toBeGreaterThan(.01); expect(first).toBeLessThan(.1);
  await page.getByRole('heading', { name: 'Timeline', exact: true }).click(); await page.keyboard.press('.');
  await expect.poll(() => page.locator('video').evaluate((media: HTMLVideoElement) => media.currentTime)).toBeCloseTo(first * 2, 3);
  await page.getByRole('button', { name: 'Go to time', exact: true }).click();
  await page.getByLabel('Sequence time', { exact: true }).fill('99:00'); await page.getByRole('button', { name: 'Go to position' }).click();
  await expect(page.getByRole('dialog', { name: 'Go to time' }).getByRole('alert')).toContainText('beyond');
  await page.getByLabel('Sequence time', { exact: true }).fill('0:02.125'); await page.getByRole('button', { name: 'Go to position' }).click();
  await expect.poll(() => page.locator('video').evaluate((media: HTMLVideoElement) => media.currentTime)).toBeCloseTo(2.125, 3);
  await page.getByRole('button', { name: 'Play', exact: true }).click(); await page.getByRole('button', { name: 'Previous frame', exact: true }).click();
  expect(await page.locator('video').evaluate((media: HTMLVideoElement) => media.paused)).toBe(true);
  await expect(page.getByRole('slider', { name: 'Trim start', exact: true })).toHaveAttribute('aria-valuenow', '0');
});
