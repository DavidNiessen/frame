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
    (window as unknown as { updates: number; timeUpdates: number }).updates = 0;
    (window as unknown as { timeUpdates: number }).timeUpdates = 0;
    document.querySelector('video')!.addEventListener('timeupdate', event => {
      if (!(event.target as HTMLVideoElement).paused) (window as unknown as { timeUpdates: number }).timeUpdates++;
    });
    new MutationObserver(() => { (window as unknown as { updates: number }).updates++; }).observe(head, { attributes: true, attributeFilter: ['style'] });
  });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => Number(await page.getByLabel('Seek playhead').inputValue())).toBeGreaterThan(0.8);
  await expect.poll(() => page.evaluate(() => (window as unknown as { updates: number }).updates)).toBeGreaterThan(15);
  const samples = await page.evaluate(() => { const state = window as unknown as { updates: number; timeUpdates: number }; return { updates: state.updates, timeUpdates: state.timeUpdates }; });
  // Require updates substantially more frequent than the browser's coarse
  // timeupdate event, without assuming a particular CI display frame rate.
  expect(samples.updates).toBeGreaterThan(samples.timeUpdates * 2);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByLabel('Seek playhead').fill('2'); await page.getByRole('button', { name: 'Split', exact: true }).click();
  await page.getByLabel('Seek playhead').fill('4'); await page.getByRole('button', { name: 'Split', exact: true }).click();
  await page.getByLabel('Seek playhead').fill('3'); await page.getByRole('button', { name: 'Remove selected section' }).click();
  await page.getByLabel('Seek playhead').fill('1.85'); await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => Number(await page.getByLabel('Seek playhead').inputValue())).toBeGreaterThanOrEqual(4);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('video')).toHaveJSProperty('paused', true);
  const stopped = await page.getByLabel('Seek playhead').inputValue();
  await page.getByRole('tab', { name: 'Export', exact: true }).click();
  await expect(page.getByLabel('Seek playhead')).toHaveValue(stopped);
});
