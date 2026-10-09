import type { Page } from '@playwright/test';
export async function openEffect(page: Page, name: string) {
  await page.getByRole('tab', { name: 'Effects', exact: true }).click();
  const back = page.getByRole('button', { name: 'Back to effect library', exact: true });
  if (await back.isVisible()) await back.click();
  await page.getByLabel('Search effects').fill('');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  const compact = page.getByRole('button', { name: 'Compact', exact: true });
  if (await compact.getAttribute('aria-pressed') === 'true') await compact.click();
  await page.getByRole('button', { name: `Add ${name}`, exact: true }).click();
}
