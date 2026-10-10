import { test, expect } from '@playwright/test';
import { importTestMedia } from '../helpers/import-media';
import { closeEffect } from '../helpers/effects';

for (const width of [1440, 390]) test(`follows effects during a drag and cancels in one gesture at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
  await page.goto('/'); await importTestMedia(page); await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  await page.getByLabel('Seek playhead').fill('3'); await page.getByRole('button', { name: 'Split', exact: true }).click();
  await page.getByRole('button', { name: 'Add Volume', exact: true }).click();
  for (const [effect, label] of [['Volume', 'Volume instance 2 effect'], ['Captions', 'Caption 1'], ['Watermark', 'Watermark effect']]) {
    await closeEffect(page); await page.getByLabel('Seek playhead').fill('1'); await page.getByRole('button', { name: `Add ${effect}`, exact: true }).click();
    const body = page.getByRole('button', { name: label, exact: true }), start = page.getByRole('slider', { name: `${label} start`, exact: true });
    await body.scrollIntoViewIfNeeded(); const bounds = (await body.boundingBox())!, lane = await body.evaluate(node => node.closest('.timeline-lane')!.getBoundingClientRect().width);
    await page.keyboard.down('Alt'); await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + lane / 3, bounds.y + bounds.height / 2, { steps: 10 });
    await expect(page.getByLabel('Seek playhead')).toHaveValue('3'); await expect(start).toHaveAttribute('aria-valuenow', '3');
    await expect(page.getByRole('dialog')).toBeVisible(); await page.mouse.up(); await page.keyboard.up('Alt');
    await expect(start).toHaveAttribute('aria-valuenow', '3'); await closeEffect(page);
    await page.getByRole('button', { name: 'Undo edit', exact: true }).click(); await expect(start).toHaveAttribute('aria-valuenow', '1');
    await body.scrollIntoViewIfNeeded(); const original = (await body.boundingBox())!;
    await page.keyboard.down('Alt'); await page.mouse.move(original.x + original.width / 2, original.y + original.height / 2); await page.mouse.down();
    await page.mouse.move(original.x + original.width / 2 + lane / 6, original.y + original.height / 2, { steps: 8 });
    await expect(page.getByLabel('Seek playhead')).toHaveValue('2');
    await page.keyboard.press('Escape'); await page.mouse.up(); await page.keyboard.up('Alt');
    await expect(start).toHaveAttribute('aria-valuenow', '1'); await expect(page.getByLabel('Seek playhead')).toHaveValue('1');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
