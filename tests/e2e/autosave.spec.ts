import { trim } from '../helpers/timeline';
import { test, expect } from '@playwright/test';
test('recovers browser autosaved edits after reload and protects pending recovery', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample' }).click(); await page.getByRole('tab', { name: 'Edit', exact: true }).click(); await trim(page, 'start', 1); await page.getByRole('tab', { name: 'Edit', exact: true }).click(); await trim(page, 'end', 2);
  await expect(page.getByLabel('Autosave status')).toHaveText('Workspace autosaved');
  await page.reload(); await expect(page.getByRole('button', { name: 'Recover workspace' })).toBeVisible();
  await page.getByRole('button', { name: 'Try a sample' }).click(); await expect(page.getByLabel('Trim start', { exact: true })).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByLabel('Autosave status')).toHaveText('Recovery pending');
  await page.getByRole('button', { name: 'Recover workspace' }).click(); await page.getByRole('button', { name: 'Restore edits' }).click();
  await expect(page.getByLabel('Trim start', { exact: true })).toHaveAttribute('aria-valuenow', '1'); await expect(page.getByLabel('Trim end')).toHaveAttribute('aria-valuenow', '2'); await expect(page.getByRole('button', { name: 'Recover workspace' })).toHaveCount(0);
  await expect(page.getByLabel('Autosave status')).toHaveText('Workspace autosaved');
});
test('discards a prior browser recovery explicitly', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample' }).click(); await expect(page.getByLabel('Autosave status')).toHaveText('Workspace autosaved'); await page.reload();
  await page.getByRole('button', { name: 'Discard recovery' }).click(); await expect(page.getByRole('button', { name: 'Recover workspace' })).toHaveCount(0); await expect(page.getByLabel('Autosave status')).toHaveText('Autosave ready');
});
