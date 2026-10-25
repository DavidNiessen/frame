import { expect, type Page } from '@playwright/test';
/** Cuts play straight from the source, which seeks once across the removed section. */
export async function verifyJoinedPlayback(page: Page, removed = 2) {
  const media = page.locator('video[data-frame-source]');
  await expect(media).toHaveJSProperty('readyState', 4);
  await expect(media).toHaveAttribute('data-preview-clock', 'source');
  await expect(media).not.toHaveAttribute('data-preview-preparing', 'true');
  const source = await media.getAttribute('src');
  await page.getByLabel('Seek playhead').fill('1.5');
  await expect
    .poll(async () => media.evaluate((node: HTMLVideoElement) => !node.seeking))
    .toBe(true);
  await media.evaluate((node: HTMLVideoElement) => {
    node.dataset.seamSeeks = '';
    node.addEventListener('seeking', () => (node.dataset.seamSeeks += `${node.currentTime};`));
  });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(async () => Number(await page.getByLabel('Seek playhead').inputValue()), {
      timeout: 10000,
    })
    .toBeGreaterThan(2.2 + removed);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const seeks = (await media.getAttribute('data-seam-seeks'))!
    .split(';')
    .filter(Boolean)
    .map(Number);
  expect(seeks).toHaveLength(1);
  expect(seeks[0]).toBeCloseTo(2 + removed, 1);
  // Nothing is rendered for cuts.
  await expect(media).toHaveAttribute('src', source!);
  await expect(media).not.toHaveAttribute('data-preview-preparing', 'true');
  await page.getByLabel('Seek playhead').fill('5');
  await expect
    .poll(async () => media.evaluate((node: HTMLVideoElement) => node.currentTime))
    .toBeCloseTo(5, 2);
}
