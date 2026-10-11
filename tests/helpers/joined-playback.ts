import { expect, type Page } from '@playwright/test';
/** A continuous stream must cross a removed source section without a decoder seek. */
export async function verifyJoinedPlayback(page: Page, removed = 2) {
  const media = page.locator('video[data-frame-source]');
  await expect(media).toHaveAttribute('data-preview-clock', 'sequence', { timeout: 60000 });
  await expect(media).toHaveJSProperty('readyState', 4);
  await expect
    .poll(async () => media.evaluate((node: HTMLVideoElement) => node.duration))
    .toBeCloseTo(6 - removed, 1);
  await page.getByLabel('Seek playhead').fill('1.5');
  await expect
    .poll(async () => media.evaluate((node: HTMLVideoElement) => !node.seeking))
    .toBe(true);
  await media.evaluate((node: HTMLVideoElement) => {
    node.dataset.seamSeeks = '0';
    node.addEventListener(
      'seeking',
      () => (node.dataset.seamSeeks = String(Number(node.dataset.seamSeeks) + 1)),
    );
  });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(async () => Number(await page.getByLabel('Seek playhead').inputValue()), {
      timeout: 10000,
    })
    .toBeGreaterThan(2.2 + removed);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const state = await media.evaluate((node: HTMLVideoElement) => ({
    time: node.currentTime,
    seeks: Number(node.dataset.seamSeeks),
  }));
  expect(state.time).toBeGreaterThan(2.2);
  expect(state.time).toBeLessThan(6 - removed);
  expect(state.seeks).toBe(0);
  // Scrubbing and Space use the source clock rather than confusing it with proxy time.
  await page.getByLabel('Seek playhead').fill('5');
  await expect
    .poll(async () => media.evaluate((node: HTMLVideoElement) => node.currentTime))
    .toBeCloseTo(5 - removed, 2);
}
