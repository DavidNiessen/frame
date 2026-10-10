import { importTestMedia } from '../helpers/import-media';
import { expect, test } from '@playwright/test';
import { closeEffect } from '../helpers/effects';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
  await page.goto('/'); await importTestMedia(page);
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4, { timeout: 30000 });
});
for (const width of [1440, 390]) test(`adds timed instances and keeps per-clip adjustments independent at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  await expect(page.getByRole('button', { name: 'Generate thumbnails', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Select Volume effect', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apply effect', exact: true })).toHaveCount(0);
  await expect(page.getByText('Mute, balance or boost a clip', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add Volume', exact: true }).click();
  const first = page.getByRole('button', { name: 'Volume clip 1', exact: true });
  await first.click(); await page.getByLabel('Volume', { exact: true }).fill('0.5'); await closeEffect(page);
  await page.getByRole('button', { name: 'Select Volume effect', exact: true }).dblclick();
  const second = page.getByRole('button', { name: 'Volume instance 2 clip 1', exact: true }); await expect(second).toBeVisible(); await second.click();
  await expect(page.getByRole('dialog')).toBeVisible(); await expect(page.getByLabel('Volume', { exact: true })).toHaveValue('1');
  await page.getByLabel('Volume', { exact: true }).fill('0.4');
  await expect(page.locator('video')).toHaveJSProperty('volume', .2);
  const overlay = page.getByRole('dialog'), island = page.locator('#media-inspector');
  await page.waitForTimeout(220);
  const panel = (await island.boundingBox())!, bounds = (await overlay.boundingBox())!;
  expect(bounds.height).toBeCloseTo(Math.min(panel.height, 876), 0);
  await page.screenshot({ path: testInfo.outputPath(`effect-overlay-${width}.png`) });
  await page.getByRole('button', { name: 'Reset Volume', exact: true }).click();
  await expect(page.getByLabel('Volume', { exact: true })).toHaveValue('1');
  await page.getByRole('button', { name: 'Remove Volume', exact: true }).click(); await expect(second).toHaveCount(0); await expect(first).toBeVisible();
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click(); await expect(second).toBeVisible();
  await first.click(); await page.getByLabel('Volume', { exact: true }).fill('0.5'); await closeEffect(page);
  await page.getByLabel('Seek playhead').fill('3'); await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Volume clip 2', exact: true })).toBeVisible();
  await expect(page.getByLabel('Autosave status')).toHaveText('Workspace autosaved', { timeout: 30000 }); await page.reload();
  await page.getByRole('button', { name: 'Volume clip 2', exact: true }).click();
  await expect(page.getByLabel('Volume', { exact: true })).toHaveValue('0.5');
  await page.getByLabel('Volume', { exact: true }).fill('0.8'); await closeEffect(page);
  await page.getByRole('button', { name: 'Volume clip 2', exact: true }).click(); await expect(page.getByLabel('Volume', { exact: true })).toHaveValue('0.8'); await closeEffect(page);
  await page.getByRole('button', { name: 'Volume clip 1', exact: true }).click(); await expect(page.getByLabel('Volume', { exact: true })).toHaveValue('0.5');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('adds multiple captions at the playhead and adjusts their own text and position', async ({ page }) => {
  await page.getByLabel('Seek playhead').fill('1'); await page.getByRole('button', { name: 'Add Captions', exact: true }).click();
  await page.getByLabel('Seek playhead').fill('3'); await page.getByRole('button', { name: 'Add Captions', exact: true }).click();
  await page.getByRole('button', { name: 'Caption 2', exact: true }).click(); await expect(page.getByRole('button', { name: 'Add caption', exact: true })).toHaveCount(0);
  await page.getByLabel('Caption text', { exact: true }).fill('Second caption'); await closeEffect(page);
  const movable = page.getByRole('button', { name: 'Move caption 2', exact: true }); await expect(movable).toHaveText('Second caption');
  await movable.focus(); await movable.press('ArrowUp');
  await page.getByRole('button', { name: 'Caption 1', exact: true }).click(); await expect(page.getByLabel('Caption text', { exact: true })).toHaveValue('New caption'); await closeEffect(page);
  await page.getByRole('button', { name: 'Remove caption 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Caption 1', exact: true })).toHaveText('Second caption');
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click(); await expect(page.getByRole('button', { name: 'Caption 2', exact: true })).toHaveText('Second caption');
});
test('reuses corrections and creates independent captions and watermarks from the catalogue', async ({ page }) => {
  const labels = await page.locator('.effect-card .effect-apply').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')!));
  for (const name of labels) {
    const repeatable = ['Add Captions', 'Add Watermark', 'Add Volume', 'Add Equalizer', 'Add Noise reduction', 'Add Color & LUTs'].includes(name);
    const plus = page.getByRole('button', { name, exact: true }); await plus.click(); await page.getByRole('button', { name: repeatable ? name : name.replace('Add ', 'Edit '), exact: true }).click();
    if (repeatable) await expect(page.getByRole('dialog')).toHaveCount(0);
    else { await expect(page.getByRole('dialog')).toBeVisible(); await closeEffect(page); }
  }
  await expect(page.getByRole('button', { name: 'Watermark instance 2 effect', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Remove silence instance 2 effect', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove silence effect', exact: true }).click(); await page.getByLabel('Silence threshold', { exact: true }).fill('-40'); await closeEffect(page);
  await page.getByRole('button', { name: 'Edit Remove silence', exact: true }).click(); await expect(page.getByLabel('Silence threshold', { exact: true })).toHaveValue('-40');
});
test('reopens crop settings without creating another crop and preserves caption placement', async ({ page }) => {
  await page.getByRole('button', { name: 'Add Crop', exact: true }).click(); await page.getByRole('button', { name: 'Crop clip 1', exact: true }).click();
  await page.getByRole('button', { name: '1:1', exact: true }).click(); await closeEffect(page);
  await page.getByRole('button', { name: 'Edit Crop', exact: true }).click(); await expect(page.getByLabel('Crop width')).toHaveValue('360');
  await expect(page.getByRole('button', { name: 'Crop instance 2 clip 1', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '1:1', exact: true }).click(); await page.getByLabel('Crop width').fill('180'); await page.getByLabel('Crop height').fill('180'); await page.getByLabel('Crop x').fill('0'); await page.getByLabel('Crop y').fill('0'); await closeEffect(page);
  await page.getByRole('button', { name: 'Add Captions', exact: true }).click();
  const frame = (await page.locator('.media-frame').boundingBox())!, area = (await page.locator('.caption-preview').boundingBox())!;
  expect(area.x).toBeCloseTo(frame.x, 0); expect(area.y).toBeCloseTo(frame.y, 0); expect(area.width).toBeCloseTo(frame.width * 180 / 640, 0); expect(area.height).toBeCloseTo(frame.height * 180 / 360, 0);
  const caption = page.getByRole('button', { name: 'Move caption 1', exact: true }); await caption.focus(); await caption.press('ArrowUp'); await expect(caption).toHaveClass(/positioned/);
  await page.getByRole('button', { name: 'Crop clip 1', exact: true }).click(); await expect(page.getByLabel('Crop width')).toHaveValue('180');
});
