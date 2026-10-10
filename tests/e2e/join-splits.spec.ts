import { test, expect } from '@playwright/test';
import { importTestMedia } from '../helpers/import-media';
import { setBoundary } from '../helpers/timeline';

for (const width of [1440, 390]) test(`joins splits without changing effects and supports undo at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
  await page.goto('/'); await importTestMedia(page); await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  const join = page.getByRole('button', { name: 'Join splits', exact: true }); await expect(join).toBeDisabled();
  await page.getByRole('button', { name: 'Add Video fade out', exact: true }).click();
  await page.getByLabel('Seek playhead').fill('1'); await page.getByRole('button', { name: 'Add Captions', exact: true }).click();
  for (const time of [2, 4]) { await page.getByLabel('Seek playhead').fill(String(time)); await page.getByRole('button', { name: 'Split', exact: true }).click(); }
  await expect(page.locator('.timeline-clip')).toHaveCount(3); await expect(join).toBeEnabled();
  await join.click(); await expect(page.locator('.timeline-clip')).toHaveCount(2);
  await join.click(); await expect(page.locator('.timeline-clip')).toHaveCount(1); await expect(join).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Video fade out effect', exact: true })).toHaveCount(1);
  await expect(page.getByRole('slider', { name: 'Video fade out effect start', exact: true })).toHaveAttribute('aria-valuenow', '5.5');
  await expect(page.getByRole('slider', { name: 'Caption 1 start', exact: true })).toHaveAttribute('aria-valuenow', '1');
  await expect(page.getByRole('slider', { name: 'Caption 1 end', exact: true })).toHaveAttribute('aria-valuenow', '3');
  await expect(page.getByLabel('Trim end', { exact: true })).toHaveAttribute('aria-valuenow', '6');
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click(); await expect(page.locator('.timeline-clip')).toHaveCount(2);
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click(); await expect(page.locator('.timeline-clip')).toHaveCount(3);
  await setBoundary(page, 'Section 1 end', 1.5);
  await page.locator('.timeline-clip .range-body').first().click(); await expect(join).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
