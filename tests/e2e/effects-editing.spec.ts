import { importTestMedia } from '../helpers/import-media';
import { expect, test } from '@playwright/test';
import { closeEffect, openEffect } from '../helpers/effects';
import { trim, setBoundary } from '../helpers/timeline';
import { conversionLibrary } from '../helpers/conversion-library';
import { rm } from 'node:fs/promises';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('frame:auto-waveforms', 'false'));
});
for (const width of [1440, 390])
  test(`provides crop and volume in timeline overlays with timeline trimming at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await importTestMedia(page);
    await expect(page.getByRole('tab', { name: 'Edit', exact: true })).toHaveCount(0);
    await expect(page.getByRole('tab')).toHaveCount(2);
    await expect(page.getByRole('tab', { name: 'Effects', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Add Trim', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Set in at playhead' })).toHaveCount(0);
    await trim(page, 'start', 1);
    await expect(page.getByLabel('Trim start', { exact: true })).toHaveAttribute(
      'aria-valuenow',
      '1',
    );
    await trim(page, 'end', 5);
    await openEffect(page, 'Crop');
    await page.getByRole('button', { name: '1:1', exact: true }).click();
    await expect(page.getByLabel('Crop width')).toHaveValue('360');
    await page.getByLabel('Crop width').fill('320');
    await page.getByLabel('Crop x', { exact: true }).fill('100');
    await expect(page.getByLabel('Crop x', { exact: true })).toHaveValue('100');
    await page.getByRole('button', { name: 'Original', exact: true }).click();
    await expect(page.getByLabel('Crop width')).toHaveCount(0);
    await page.getByRole('button', { name: 'Set custom crop', exact: true }).click();
    await expect(page.getByLabel('Crop width')).toHaveValue('640');
    await openEffect(page, 'Volume');
    await page.getByLabel('Volume', { exact: true }).fill('1.4');
    await expect(
      page.getByText('Boost above 100% updates in the automatic effects preview and may clip.', {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Reset to 100%', exact: true }).click();
    await expect(page.getByLabel('Volume', { exact: true })).toHaveValue('1');
    await page.getByRole('button', { name: 'Mute', exact: true }).click();
    await expect(page.locator('video')).toHaveJSProperty('volume', 0);
    await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
    await openEffect(page, 'Volume');
    await expect(page.getByLabel('Volume', { exact: true })).toHaveValue('1');
    await closeEffect(page);
    await page.getByRole('tab', { name: 'Export', exact: true }).click();
    await closeEffect(page);
    await openEffect(page, 'Volume');
    await expect(page.getByLabel('Volume', { exact: true })).toHaveValue('1');
    await closeEffect(page);
    await page.getByRole('tab', { name: 'Effects', exact: true }).click();
    await expect(page.getByLabel('Search effects')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
test('trims split clips independently and preserves trimming when removing track effects', async ({
  page,
}) => {
  await page.goto('/');
  await importTestMedia(page);
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  await page.getByLabel('Seek playhead').fill('3');
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await closeEffect(page);
  await setBoundary(page, 'Section 2 start', 3.5);
  await expect(page.getByLabel('Section 2 start')).toHaveAttribute('aria-valuenow', '3.5');
  await expect(page.getByLabel('Trim start', { exact: true })).toHaveAttribute(
    'aria-valuenow',
    '0',
  );
  await openEffect(page, 'Volume');
  await page.getByLabel('Volume', { exact: true }).fill('0.4');
  await closeEffect(page);
  await openEffect(page, 'Volume');
  await expect(page.getByLabel('Volume', { exact: true })).toHaveValue('0.4');
  await closeEffect(page);
  await page.getByRole('button', { name: 'Remove all track effects', exact: true }).click();
  await expect(page.getByLabel('Section 2 start')).toHaveAttribute('aria-valuenow', '3.5');
  await expect(page.getByRole('button', { name: 'Remove Volume', exact: true })).toHaveCount(0);
});
test('offers trimming, mute and reset for audio while keeping video controls out', async ({
  page,
}) => {
  const library = await conversionLibrary();
  try {
    await page.goto('/');
    await expect(page.getByLabel('Autosave status')).toHaveText('Autosave ready');
    await page.getByLabel('Choose media files').setInputFiles(library.sources[0]);
    await trim(page, 'start', 0.4);
    await openEffect(page, 'Volume');
    await page.getByRole('button', { name: 'Mute', exact: true }).click();
    await expect(page.locator('audio').first()).toHaveJSProperty('volume', 0);
    await page.getByRole('button', { name: 'Reset to 100%', exact: true }).click();
    await expect(page.getByLabel('Volume', { exact: true })).toHaveValue('1');
    await expect(page.getByRole('button', { name: 'Add Crop', exact: true })).toHaveCount(0);
  } finally {
    await rm(library.directory, { recursive: true, force: true });
  }
});
