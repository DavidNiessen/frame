import { expect, test } from '@playwright/test';
import { closeEffect, openEffect } from '../helpers/effects';
import { setBoundary, trim } from '../helpers/timeline';
async function sample(page: import('@playwright/test').Page) {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample', exact: true }).click(); await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
}
for (const width of [1440, 390]) test(`keeps the catalogue stable and opens settings from timeline bars at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await sample(page);
  await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click();
  const browser = page.getByRole('region', { name: 'Effect browser', exact: true }), search = browser.getByLabel('Search effects');
  await search.fill('Equalizer'); const item = browser.getByRole('button', { name: 'Select Equalizer effect', exact: true });
  await item.scrollIntoViewIfNeeded(); const before = (await item.boundingBox())!;
  await browser.getByRole('button', { name: 'Add Equalizer', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Effects', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(search).toHaveValue('Equalizer'); await expect(item).toBeVisible();
  expect((await item.boundingBox())!.y).toBeCloseTo(before.y, 0);
  await expect(page.getByLabel('Equalizer bass')).toBeHidden();
  await page.getByRole('button', { name: 'Equalizer clip 1', exact: true }).click();
  await page.getByLabel('Equalizer bass').fill('2');
  await page.getByRole('button', { name: 'Reset Equalizer', exact: true }).click();
  await expect(page.getByLabel('Equalizer bass')).toHaveValue('0'); await expect(page.getByRole('button', { name: 'Remove Equalizer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove Equalizer', exact: true }).click(); await expect(page.getByRole('button', { name: 'Equalizer clip 1', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click(); await expect(page.getByRole('button', { name: 'Equalizer clip 1', exact: true })).toBeVisible();
  await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click(); await expect(search).toHaveValue('Equalizer');
  await expect(browser.getByRole('button', { name: 'Select Equalizer effect', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('edits one timeline effect at a time and retains neutral settings until removal', async ({ page }) => {
  await sample(page); await page.getByLabel('Seek playhead').fill('3'); await page.getByRole('button', { name: 'Split', exact: true }).click(); await page.getByLabel('Effect target').selectOption({ index: 2 });
  await openEffect(page, 'Volume'); await page.getByLabel('Volume', { exact: true }).fill('0.5'); await closeEffect(page);
  await page.getByRole('button', { name: 'Volume clip 2', exact: true }).click(); await expect(page.getByRole('dialog', { name: 'Volume settings', exact: true })).toBeVisible();
  await openEffect(page, 'Speed'); await page.getByLabel('Playback speed').selectOption('2'); await expect(page.getByRole('dialog')).toHaveCount(1);
  await closeEffect(page); await page.getByRole('button', { name: 'Volume clip 2', exact: true }).click();
  await page.getByRole('button', { name: 'Reset Volume', exact: true }).click(); await expect(page.getByLabel('Volume', { exact: true })).toHaveValue('1'); await closeEffect(page);
  await expect(page.getByRole('button', { name: 'Volume clip 2', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click(); await page.getByRole('button', { name: 'Volume clip 2', exact: true }).click(); await expect(page.getByLabel('Volume', { exact: true })).toHaveValue('0.5'); await closeEffect(page);
  await closeEffect(page); await page.getByRole('button', { name: 'Remove Volume from clip 2', exact: true }).click(); await closeEffect(page); await page.getByRole('button', { name: 'Remove Speed from clip 2', exact: true }).click();
  await expect(page.locator('.effect-lane')).toHaveCount(0); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Autosave status')).toHaveText('Workspace autosaved', { timeout: 30000 });
});
test('handles shared effects, isolated resets and clearing clip effects without removing captions', async ({ page }) => {
  await sample(page); await openEffect(page, 'Volume'); await page.getByLabel('Volume', { exact: true }).fill('0.5'); await page.getByLabel('Seek playhead').fill('3'); await page.getByRole('button', { name: 'Split', exact: true }).click();
  await page.locator('.timeline-track-filters').getByRole('button', { name: 'effects', exact: true }).click(); await closeEffect(page); await page.getByRole('button', { name: 'Remove Volume from clip 2', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Volume clip 1', exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Volume clip 2', exact: true })).toHaveCount(0);
  await closeEffect(page); await page.getByLabel('Effect target').selectOption('all'); await openEffect(page, 'Captions'); await page.getByRole('button', { name: 'Add caption', exact: true }).click();
  await closeEffect(page); await page.getByRole('button', { name: 'Remove all clip effects', exact: true }).click();
  await expect(page.locator('.effect-lane')).toHaveCount(1); await expect(page.getByRole('button', { name: 'Captions effect', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click(); await expect(page.getByRole('button', { name: 'Volume clip 1', exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Volume clip 2', exact: true })).toHaveCount(0);
});
test('keeps tiny split clips recoverable and allows trimming back and restoring the outside edges', async ({ page }) => {
  await sample(page); await trim(page, 'start', 2.4); await trim(page, 'end', 2.5);
  await page.getByLabel('Seek playhead').fill('2.45'); await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(page.locator('.timeline-clip')).toHaveCount(2); await expect(page.locator('.timeline-clip').first()).toHaveAttribute('data-duration', '6'); await page.getByRole('button', { name: 'Fit', exact: true }).click(); expect(Number(await page.locator('.timeline-clip').first().getAttribute('data-duration'))).toBeCloseTo(.1); await expect(page.getByLabel('Autosave status')).toHaveText('Workspace autosaved', { timeout: 30000 });
  await page.getByLabel('Trim start', { exact: true }).press('Home'); await page.getByLabel('Trim end', { exact: true }).press('End');
  await expect(page.getByLabel('Trim start', { exact: true })).toHaveAttribute('aria-valuenow', '0'); await expect(page.getByLabel('Trim end', { exact: true })).toHaveAttribute('aria-valuenow', '6');
  await setBoundary(page, 'Section 1 end', 2); await setBoundary(page, 'Section 2 start', 3);
  await expect(page.getByLabel('Section 1 end')).toHaveAttribute('aria-valuenow', '2'); await expect(page.getByLabel('Section 2 start')).toHaveAttribute('aria-valuenow', '3');
  await setBoundary(page, 'Section 1 end', 2.45); await setBoundary(page, 'Section 2 start', 2.45);
  const left = (await page.getByLabel('Section 1 end', { exact: true }).boundingBox())!, right = (await page.getByLabel('Section 2 start', { exact: true }).boundingBox())!;
  expect(left.x + left.width).toBeLessThanOrEqual(right.x);
  await page.mouse.move(left.x + left.width - 2, left.y + left.height / 2); await page.mouse.down(); await page.mouse.move(left.x - 50, left.y + left.height / 2, { steps: 10 }); await page.mouse.up();
  expect(Number(await page.getByLabel('Section 1 end').getAttribute('aria-valuenow'))).toBeLessThan(2.45); await expect(page.getByLabel('Section 2 start')).toHaveAttribute('aria-valuenow', '2.45');
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click(); await expect(page.getByLabel('Section 1 end')).toHaveAttribute('aria-valuenow', '2.45');
});
test('removes sequence and clip fades and exposes usable effect controls on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await sample(page); await openEffect(page, 'Audio fade in');
  await page.getByRole('button', { name: 'Remove Audio fade in', exact: true }).click(); await expect(page.locator('.effect-lane')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click(); await expect(page.getByRole('button', { name: 'Audio fade in', exact: true })).toBeVisible();
  await page.getByLabel('Seek playhead').fill('3'); await page.getByRole('button', { name: 'Split', exact: true }).click(); await openEffect(page, 'Video fade out');
  await page.getByRole('button', { name: 'Remove Video fade out', exact: true }).click(); await expect(page.getByRole('button', { name: 'Remove Video fade out from clip 1', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('deletes focused captions and source watermarks with undo support', async ({ page }) => {
  await sample(page); await openEffect(page, 'Captions'); await page.getByRole('button', { name: 'Add caption', exact: true }).click();
  await page.getByRole('button', { name: 'Caption 1', exact: true }).press('Delete'); await expect(page.locator('.caption-lane')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click(); await expect(page.getByRole('button', { name: 'Caption 1', exact: true })).toBeVisible();
  await openEffect(page, 'Watermark'); await page.getByLabel('Overlay text', { exact: true }).fill('Frame');
  await page.getByRole('button', { name: 'Watermark effect', exact: true }).press('Backspace'); await expect(page.getByRole('button', { name: 'Watermark effect', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click(); await expect(page.getByRole('button', { name: 'Watermark effect', exact: true })).toBeVisible();
});
