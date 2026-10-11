import { importTestMedia } from '../helpers/import-media';
import { test, expect } from '@playwright/test';

test('seeks at the pointer, scrubs beyond track edges, and preserves keyboard seeking', async ({
  page,
}) => {
  await page.goto('/');
  await importTestMedia(page);
  const playhead = page.getByLabel('Seek playhead');
  await playhead.waitFor();
  const track = page.locator('.timeline-ruler');
  const bounds = (await track.boundingBox())!;
  const y = bounds.y + bounds.height / 2;
  async function clickAt(fraction: number, start = 0, duration = 6) {
    await page.mouse.click(bounds.x + bounds.width * fraction, y);
    await expect
      .poll(async () => Number(await playhead.inputValue()))
      .toBeCloseTo(start + duration * fraction, 1);
    await expect
      .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).currentTime))
      .toBeCloseTo(start + duration * fraction, 1);
  }
  await clickAt(0.15);
  await clickAt(0.85);
  await playhead.fill('5.1');
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await clickAt(0.25);
  await page.getByRole('button', { name: 'Remove selected section' }).click();
  // Trimming preserves the scale; Fit explicitly frames the retained output sequence.
  await expect(page.locator('.timeline-range.timeline-clip')).toHaveAttribute('data-duration', '6');
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await clickAt(0.1, 5.1, 0.9);
  await expect(page.getByRole('button', { name: 'Remove selected section' })).toBeDisabled();
  await clickAt(0.95, 5.1, 0.9);
  await page.mouse.click(bounds.x + bounds.width * 0.5, y, { button: 'right' });
  await expect.poll(async () => Number(await playhead.inputValue())).toBeCloseTo(5.955, 1);
  await page.mouse.move(bounds.x + bounds.width * 0.9, y);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.92, y, { steps: 3 });
  await expect.poll(async () => Number(await playhead.inputValue())).toBeCloseTo(5.928, 1);
  await page.mouse.move(bounds.x + bounds.width + 20, y);
  await expect(playhead).toHaveValue('6');
  await page.mouse.move(bounds.x - 20, y);
  await page.mouse.up();
  await expect(playhead).toHaveValue('5.1');
  await playhead.focus();
  await playhead.press('ArrowRight');
  await expect(playhead).toHaveValue('5.11');
  await playhead.press('End');
  await expect(playhead).toHaveValue('6');
  await page.getByRole('button', { name: /Select section 1,/ }).focus();
  await page.getByRole('button', { name: /Select section 1,/ }).press('Enter');
  await expect(playhead).toHaveValue('5.1');
  await page.getByRole('button', { name: 'Export MP4', exact: true }).click();
  await expect(playhead).toBeDisabled();
  await page.mouse.click(bounds.x + bounds.width * 0.5, y);
  await expect(playhead).toHaveValue('5.1');
  await expect(page.getByRole('link', { name: 'Save file' })).toBeVisible();
  // A removed tail must not select the last retained section when seeking to source end.
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await clickAt(0.9);
  await page.getByRole('button', { name: 'Remove selected section' }).click();
  await playhead.focus();
  await playhead.press('End');
  await expect(page.locator('.timeline-clip.active')).toHaveCount(0);
  await playhead.fill('5');
  await expect(page.locator('.timeline-clip.active')).toHaveCount(1);
});
