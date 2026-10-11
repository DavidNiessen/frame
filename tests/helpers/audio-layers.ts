import { type Page, expect } from '@playwright/test';
import { closeEffect } from './effects';
export async function openAudioLayer(page: Page, name: string, index = 0) {
  await closeEffect(page);
  await page
    .locator('.timeline-track-filters')
    .getByRole('button', { name: 'All tracks', exact: true })
    .click();
  const compact = page.getByRole('button', { name: 'Compact', exact: true });
  if ((await compact.getAttribute('aria-pressed')) === 'true') await compact.click();
  await page.locator('.audio-layer-bar .range-body').filter({ hasText: name }).nth(index).click();
  await expect(
    page.getByRole('dialog', { name: 'Audio layer settings', exact: true }),
  ).toBeVisible();
}
export async function insertAudioLayer(page: Page, name: string) {
  await closeEffect(page);
  await page.getByRole('button', { name: `Layer ${name} over timeline`, exact: true }).click();
  await openAudioLayer(page, name);
}
