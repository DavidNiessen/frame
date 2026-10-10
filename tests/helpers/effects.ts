import type { Page } from '@playwright/test';
export async function closeEffect(page: Page) {
  const close = page.getByRole('button', { name: 'Close effect settings', exact: true });
  if (await close.count()) await close.click();
}
export async function openCaptionTools(page: Page) {
  await closeEffect(page); await page.getByRole('tab', { name: 'Effects', exact: true }).click();
  const tools = page.locator('.caption-tools');
  if (!await tools.evaluate(node => (node as HTMLDetailsElement).open)) await tools.locator('summary').click();
}
export async function openEffect(page: Page, name: string) {
  await closeEffect(page);
  await page.getByRole('tab', { name: 'Effects', exact: true }).click();
  await page.getByLabel('Search effects').fill('');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  const target = await page.getByLabel('Effect target').inputValue();
  if (!await page.getByRole('button', { name: `Select ${name} effect`, exact: true }).locator('..').locator('[aria-label="Applied"]').count()) await page.getByRole('button', { name: `Add ${name}`, exact: true }).click();
  await page.locator('.timeline-track-filters').getByRole('button', { name: 'All tracks', exact: true }).click();
  const compact = page.getByRole('button', { name: 'Compact', exact: true });
  if (await compact.getAttribute('aria-pressed') === 'true') await compact.click();
  if (name === 'Captions') { await page.getByRole('button', { name: 'Caption 1', exact: true }).first().click(); return; }
  let bar = page.locator('.effect-lane .range-body').filter({ hasText: name });
  if (target !== 'all') {
    const index = await page.getByLabel('Effect target').evaluate((element: HTMLSelectElement) => element.selectedIndex);
    const clip = page.getByRole('button', { name: `${name} clip ${index}`, exact: true });
    if (await clip.count()) bar = clip;
  }
  await bar.first().click();
}

export async function selectFont(page: Page, name: string) {
  await page.getByRole('combobox', { name: 'Font', exact: true }).fill(name);
  await page.getByRole('option', { name, exact: true }).click();
}
