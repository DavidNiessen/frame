import { expect, test } from '@playwright/test';
import { closeEffect, openEffect } from '../helpers/effects';
test('measures edited audio loudness and invalidates readings after adjustments', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample', exact: true }).click(); await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click(); await openEffect(page, 'Normalize loudness');
  await page.getByRole('button', { name: 'Measure edited loudness', exact: true }).click(); await expect(page.getByLabel('Edited audio loudness')).toContainText('LUFS', { timeout: 45000 }); await expect(page.getByRole('meter', { name: 'True peak level' })).toBeVisible();
  await page.getByLabel('Loudness target', { exact: true }).fill('-20'); await expect(page.getByLabel('Edited audio loudness')).toHaveCount(0);
  await page.getByRole('button', { name: 'Measure edited loudness', exact: true }).click(); await expect(page.getByLabel('Edited audio loudness')).toBeVisible({ timeout: 45000 }); expect(Math.abs(Number.parseFloat((await page.locator('.loudness-report dd').first().textContent())!) + 20)).toBeLessThan(1);
});
