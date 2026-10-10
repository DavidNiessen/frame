import { closeEffect, openEffect } from '../helpers/effects';
import { trim } from '../helpers/timeline';
import { test, expect } from '@playwright/test';
test('renders browser color and LUT corrections before exporting', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample' }).click(); await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click(); await trim(page, 'end', 1);
  await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click(); await openEffect(page, 'Color & LUTs'); await page.getByLabel('Color brightness').fill('0.2');
  const cube = 'LUT_3D_SIZE 2\n1 1 1\n0 1 1\n1 0 1\n0 0 1\n1 1 0\n0 1 0\n1 0 0\n0 0 0\n';
  await page.getByLabel('LUT file').setInputFiles({ name: 'invert.cube', mimeType: 'text/plain', buffer: Buffer.from(cube) });
  await page.getByRole('button', { name: 'Render edited frame' }).click(); const image = page.getByAltText('Rendered edited frame'); await expect(image).toBeVisible({ timeout: 45000 }); await expect(image).toHaveJSProperty('naturalWidth', 720);
  await closeEffect(page); await page.getByRole('button', { name: 'Export MP4', exact: true }).click(); await expect(page.getByRole('link', { name: 'Save file' })).toBeVisible({ timeout: 45000 });
});
