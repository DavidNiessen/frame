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
test('disables autosave without removing earlier recovery and keeps manual projects available', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Settings', exact: true }).click(); await page.getByLabel('Autosave workspace', { exact: true }).uncheck(); await page.getByRole('button', { name: 'Back to workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Try a sample', exact: true }).click(); await expect(page.getByLabel('Autosave status')).toHaveText('Autosave off');
  const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save project', exact: true }).click(); expect((await downloaded).suggestedFilename()).toMatch(/\.frame\.json$/);
  await page.reload(); await expect(page.getByLabel('Autosave status')).toHaveText('Autosave off'); await expect(page.getByRole('button', { name: 'Recover workspace', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click(); await expect(page.getByLabel('Autosave workspace', { exact: true })).not.toBeChecked(); await page.getByLabel('Autosave workspace', { exact: true }).check(); await page.getByRole('button', { name: 'Back to workspace', exact: true }).click(); await page.getByRole('button', { name: 'Try a sample', exact: true }).click(); await expect(page.getByLabel('Autosave status')).toHaveText('Workspace autosaved');
  await page.getByRole('button', { name: 'Settings', exact: true }).click(); await page.getByLabel('Autosave workspace', { exact: true }).uncheck(); await page.getByRole('button', { name: 'Back to workspace', exact: true }).click(); await expect(page.getByLabel('Autosave status')).toHaveText('Autosave off');
  await page.reload(); await expect(page.getByRole('button', { name: 'Recover workspace', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Discard recovery', exact: true }).click(); await expect(page.getByLabel('Autosave status')).toHaveText('Autosave off');
});
