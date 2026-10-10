import { test, expect } from '@playwright/test';
import { importTestMedia } from '../helpers/import-media';
import { verifyJoinedPlayback } from '../helpers/joined-playback';
import { setBoundary } from '../helpers/timeline';

for (const width of [1440, 390]) test(`joins splits without changing effects and supports undo at ${width}px`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.setViewportSize({ width, height: 1000 });
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
  await page.locator('.timeline-clip .range-body').first().click(); await expect(join).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [1440, 390]) test(`joins around a deleted middle section and preserves cuts at ${width}px`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.setViewportSize({ width, height: 1000 });
  await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
  await page.goto('/'); await importTestMedia(page); await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  for (const time of [2, 4]) { await page.getByLabel('Seek playhead').fill(String(time)); await page.getByRole('button', { name: 'Split', exact: true }).click(); }
  await page.locator('.timeline-clip .range-body').nth(1).click(); await page.getByRole('button', { name: 'Remove selected section', exact: true }).click();
  await expect(page.locator('.timeline-clip')).toHaveCount(2);
  const join = page.getByRole('button', { name: 'Join splits', exact: true }); await expect(join).toBeEnabled(); await join.click();
  await expect(page.locator('.timeline-clip')).toHaveCount(1); await expect(join).toBeDisabled();
  await expect(page.locator('.timeline-summary')).toContainText('0:04.0'); await expect(page.locator('.cut-boundary')).toHaveCount(1);
  const bar = page.locator('.timeline-clip .range-body'), bounds = (await bar.boundingBox())!;
  await bar.click({ position: { x: bounds.width * .75, y: bounds.height / 2 } });
  await expect.poll(async () => Number(await page.getByLabel('Seek playhead').inputValue())).toBeCloseTo(5, 0);
  for (const [label, target] of [['Trim start', .5], ['Trim end', 3.5]] as const) {
    const edge = page.getByRole('slider', { name: label, exact: true }); await edge.scrollIntoViewIfNeeded();
    const box = (await edge.boundingBox())!, lane = await edge.evaluate(node => node.closest('.timeline-lane')!.getBoundingClientRect().width);
    const delta = target - Number(await edge.getAttribute('aria-valuenow'));
    await page.keyboard.down('Alt'); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + lane * delta / 6, box.y + box.height / 2, { steps: 8 }); await page.mouse.up(); await page.keyboard.up('Alt');
    await expect(edge).toHaveAttribute('aria-valuenow', String(target));
  }
  await expect(page.locator('.timeline-summary')).toContainText('0:03.0');
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click(); await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click(); await expect(page.locator('.timeline-clip')).toHaveCount(2);
  await page.getByRole('button', { name: 'Redo edit', exact: true }).click(); await expect(page.locator('.timeline-clip')).toHaveCount(1);
  await page.getByLabel('Seek playhead').fill('4'); await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(page.locator('.timeline-clip')).toHaveCount(2); await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await page.getByLabel('Seek playhead').fill('5'); await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(page.locator('.timeline-clip')).toHaveCount(2); await expect(page.locator('.timeline-summary')).toContainText('0:04.0');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [1440, 390]) test(`trims freely through joined cuts and restores them at ${width}px`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.setViewportSize({ width, height: 1000 });
  await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
  await page.goto('/'); await importTestMedia(page);
  for (const time of [2, 4]) { await page.getByLabel('Seek playhead').fill(String(time)); await page.getByRole('button', { name: 'Split', exact: true }).click(); }
  await page.locator('.timeline-clip .range-body').nth(1).click(); await page.getByRole('button', { name: 'Remove selected section', exact: true }).click();
  await page.getByRole('button', { name: 'Join splits', exact: true }).click();
  await setBoundary(page, 'Trim start', 2.5); await expect(page.locator('.cut-boundary')).toHaveCount(0);
  await expect(page.locator('.timeline-summary')).toContainText('0:01.5');
  await page.getByRole('slider', { name: 'Trim start', exact: true }).press('Home');
  await expect(page.locator('.cut-boundary')).toHaveCount(1); await expect(page.locator('.timeline-summary')).toContainText('0:04.0');
  await setBoundary(page, 'Trim end', 1.5); await expect(page.locator('.cut-boundary')).toHaveCount(0);
  await page.getByRole('slider', { name: 'Trim end', exact: true }).press('End');
  await expect(page.locator('.cut-boundary')).toHaveCount(1);
  await page.getByLabel('Seek playhead').fill('5');
  const edge = page.getByRole('slider', { name: 'Trim end', exact: true }); await edge.scrollIntoViewIfNeeded();
  const box = (await edge.boundingBox())!, geometry = await edge.evaluate(node => ({ width: node.closest('.timeline-lane')!.getBoundingClientRect().width, duration: Number(node.closest('.timeline-range')!.getAttribute('data-duration')) }));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - geometry.width * 2.05 / geometry.duration, box.y + box.height / 2, { steps: 12 }); await page.mouse.up();
  expect(Number(await edge.getAttribute('aria-valuenow'))).toBeCloseTo(1.95, 2);
  await edge.press('End'); await expect(page.locator('.timeline-summary')).toContainText('0:04.0');
  await verifyJoinedPlayback(page);
});
