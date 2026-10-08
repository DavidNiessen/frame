import { test, expect } from '@playwright/test';
test('generates a real source waveform in the browser', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample' }).click();
  await page.getByRole('button', { name: 'Generate waveform' }).click();
  await expect(page.getByRole('img', { name: 'Audio waveform', exact: true })).toBeVisible({ timeout: 45000 });
  expect((await page.getByRole('img', { name: 'Audio waveform', exact: true }).locator('path').getAttribute('d'))!.length).toBeGreaterThan(100);
  await page.getByLabel('Trim start', { exact: true }).fill('1');
  await expect(page.getByRole('img', { name: 'Audio waveform', exact: true })).toBeVisible();
});
test('renders timeline thumbnails and seeks their source positions', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample' }).click();
  await page.getByRole('button', { name: 'Generate thumbnails' }).click();
  const strip = page.getByRole('group', { name: 'Timeline thumbnails', exact: true });
  await expect(strip).toBeVisible({ timeout: 45000 });
  await expect(strip.getByRole('button')).toHaveCount(12);
  await strip.getByRole('button', { name: 'Seek thumbnail 7', exact: true }).click();
  await expect(page.getByLabel('Seek playhead')).toHaveValue('3.25');
  const url = await strip.getByRole('button').first().evaluate(button => (button as HTMLElement).style.backgroundImage.slice(5, -2));
  const size = await page.evaluate(async url => {
    const bitmap = await createImageBitmap(await (await fetch(url)).blob()); const size = [bitmap.width, bitmap.height]; bitmap.close(); return size;
  }, url);
  expect(size).toEqual([1920, 90]);
});
