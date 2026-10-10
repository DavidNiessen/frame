import type { Page } from '@playwright/test';
export async function openEffect(page: Page, name: string) {
  await page.getByRole('tab', { name: 'Effects', exact: true }).click();
  await page.getByLabel('Search effects').fill('');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  const compact = page.getByRole('button', { name: 'Compact', exact: true });
  if (await compact.getAttribute('aria-pressed') === 'true') await compact.click();
  await page.getByRole('button', { name: `Add ${name}`, exact: true }).click();
  await page.getByRole('tab', { name: 'Effect Controls', exact: true }).click();
  const control = page.getByRole('button', { name: `Edit ${name}`, exact: true });
  if (await control.getAttribute('aria-expanded') !== 'true') await control.click();
}
