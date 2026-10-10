import { importTestMedia } from '../helpers/import-media';
import { test, expect, type Page } from '@playwright/test';
async function sample(page: Page) {
  await page.goto('/'); await importTestMedia(page);
  await page.getByLabel('Seek playhead').waitFor();
}
test('publishes playback time every animation frame and skips removed footage promptly', async ({ page }) => {
  await sample(page);
  // Count distinct render updates, rather than relying on an arbitrary delay between samples.
  await page.evaluate(() => {
    const head = document.querySelector('.playhead')!;
    (window as unknown as { updates: number }).updates = 0;
    new MutationObserver(() => { (window as unknown as { updates: number }).updates++; }).observe(head, { attributes: true, attributeFilter: ['style'] });
  });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => Number(await page.getByLabel('Seek playhead').inputValue())).toBeGreaterThan(0.8);
  const count = await page.evaluate(() => (window as unknown as { updates: number }).updates);
  expect(count).toBeGreaterThan(15);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByLabel('Seek playhead').fill('2'); await page.getByRole('button', { name: 'Split', exact: true }).click();
  await page.getByLabel('Seek playhead').fill('4'); await page.getByRole('button', { name: 'Split', exact: true }).click();
  await page.getByLabel('Seek playhead').fill('3'); await page.getByRole('button', { name: 'Remove selected section' }).click();
  await page.getByLabel('Seek playhead').fill('1.85'); await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => Number(await page.getByLabel('Seek playhead').inputValue())).toBeGreaterThanOrEqual(4);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const stopped = await page.getByLabel('Seek playhead').inputValue();
  await page.getByRole('tab', { name: 'Export', exact: true }).click();
  await expect(page.getByLabel('Seek playhead')).toHaveValue(stopped);
});
