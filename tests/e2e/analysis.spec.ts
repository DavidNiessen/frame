import { test, expect } from '@playwright/test';
test('generates a real source waveform in the browser', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample' }).click();
  await page.getByRole('button', { name: 'Generate waveform' }).click();
  await expect(page.getByRole('img', { name: 'Audio waveform', exact: true })).toBeVisible({ timeout: 45000 });
  expect((await page.getByRole('img', { name: 'Audio waveform', exact: true }).locator('path').getAttribute('d'))!.length).toBeGreaterThan(100);
  await page.getByLabel('Trim start', { exact: true }).fill('1');
  await expect(page.getByRole('img', { name: 'Audio waveform', exact: true })).toBeVisible();
});
