import { expect, type Page } from '@playwright/test';
import { verifyJoinedPlayback } from './joined-playback';
import { setBoundary } from './timeline';

export async function verifySplitPlayback(page: Page, remove: 'trim' | 'delete' = 'trim') {
  const video = page.locator('video'); await expect(video).toHaveJSProperty('readyState', 4);
  await page.getByLabel('Seek playhead').fill('2'); await page.getByRole('button', { name: 'Split', exact: true }).click();
  await page.getByLabel('Seek playhead').fill('4'); await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(page.locator('.timeline-clip')).toHaveCount(3);
  await page.getByLabel('Seek playhead').fill('1.6'); await expect(video).toHaveJSProperty('seeking', false);
  await video.evaluate(media => {
    (window as unknown as { previewSeeks: number[] }).previewSeeks = [];
    media.addEventListener('seeking', () => (window as unknown as { previewSeeks: number[] }).previewSeeks.push((media as HTMLVideoElement).currentTime));
  });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => video.evaluate(media => (media as HTMLVideoElement).currentTime)).toBeGreaterThan(4.2);
  expect(await page.evaluate(() => (window as unknown as { previewSeeks: number[] }).previewSeeks)).toEqual([]);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  if (remove === 'trim') await setBoundary(page, 'Section 2 start', 3);
  else {
    await page.locator('.timeline-clip .range-body').nth(1).click();
    await page.getByRole('button', { name: 'Remove selected section', exact: true }).click();
    await expect(page.locator('.timeline-clip')).toHaveCount(2);
  }
  // No Join operation: separate bars share the continuous decoder stream.
  await verifyJoinedPlayback(page, remove === 'trim' ? 1 : 2);
  const previous = await video.getAttribute('src');
  await page.getByLabel('Seek playhead').fill('5'); await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(video).toHaveAttribute('src', previous!);
  await expect(video).not.toHaveAttribute('data-preview-preparing', 'true');
}
