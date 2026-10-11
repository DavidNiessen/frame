import { expect, type Page } from '@playwright/test';
export async function waitForPreviewMetadata(page: Page) {
  const media = page.locator('video, audio').first();
  // A paused preload=metadata player need not buffer frames. Wait for the metadata
  // callback to initialize its source clock before changing timeline boundaries.
  await expect
    .poll(() => media.evaluate((node) => (node as HTMLMediaElement).readyState))
    .toBeGreaterThanOrEqual(1);
  await expect(media).not.toHaveAttribute('data-preview-switching', 'true');
}
export async function trim(page: Page, edge: 'start' | 'end', seconds: number) {
  await waitForPreviewMetadata(page);
  const start = Number(
    await page
      .getByRole('slider', { name: 'Trim start', exact: true })
      .getAttribute('aria-valuenow'),
  );
  const end = Number(
    await page.getByRole('slider', { name: 'Trim end', exact: true }).getAttribute('aria-valuenow'),
  );
  // Restoring source outside the retained footage uses an edge, not the playback cursor.
  if (seconds < start || seconds > end) {
    await setBoundary(page, `Trim ${edge}`, seconds);
    return;
  }
  const playhead = page.getByLabel('Seek playhead');
  const previous = await playhead.inputValue();
  await playhead.fill(String(seconds));
  await page.getByRole('heading', { name: 'Timeline', exact: true }).click();
  await page.keyboard.press(edge === 'start' ? 'i' : 'o');
  await expect(page.getByRole('slider', { name: `Trim ${edge}`, exact: true })).toHaveAttribute(
    'aria-valuenow',
    String(seconds),
  );
  await playhead.fill(previous);
}
export async function setBoundary(page: Page, label: string, seconds: number) {
  const handle = page.getByRole('slider', { name: label, exact: true });
  await handle.focus();
  let delta = Math.round((seconds - Number(await handle.getAttribute('aria-valuenow'))) * 100);
  for (const [step, positive, negative] of [
    [100, 'PageUp', 'PageDown'],
    [10, 'Shift+ArrowRight', 'Shift+ArrowLeft'],
    [1, 'ArrowRight', 'ArrowLeft'],
  ] as const) {
    while (Math.abs(delta) >= step) {
      await handle.press(delta > 0 ? positive : negative);
      delta += delta > 0 ? -step : step;
    }
  }
  await expect(handle).toHaveAttribute('aria-valuenow', String(seconds));
}
