import type { Page } from '@playwright/test';
export async function closeEffect(page: Page) {
  const close = page.getByRole('button', { name: /^Close (effect|audio layer) settings$/ });
  if (await close.count()) {
    // Fixed overlays follow their stacked island; scroll the page before clicking.
    if (
      await page
        .locator('[data-layout="stacked"]:not([data-expanded="true"]) #media-inspector')
        .count()
    )
      await page.locator('#media-inspector').scrollIntoViewIfNeeded();
    await close.click();
  }
}
export async function openCaptionTools(page: Page) {
  await closeEffect(page);
  await page.getByRole('tab', { name: 'Effects', exact: true }).click();
  const tools = page.locator('.caption-tools');
  if (!(await tools.evaluate((node) => (node as HTMLDetailsElement).open)))
    await tools.locator('summary').click();
}
export async function openEffect(page: Page, name: string) {
  await closeEffect(page);
  await page.getByRole('tab', { name: 'Effects', exact: true }).click();
  await page.getByLabel('Search effects').fill('');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page
    .locator('.timeline-track-filters')
    .getByRole('button', { name: 'All tracks', exact: true })
    .click();
  const compact = page.getByRole('button', { name: 'Compact', exact: true });
  if ((await compact.getAttribute('aria-pressed')) === 'true') await compact.click();
  if (name === 'Remove silence') {
    const edit = page.getByRole('button', { name: 'Edit Remove silence', exact: true });
    if (!(await edit.count()))
      await page.getByRole('button', { name: 'Add Remove silence', exact: true }).click();
    await edit.click();
    return;
  }
  const bar =
    name === 'Captions'
      ? page.getByRole('button', { name: 'Caption 1', exact: true })
      : page.locator('.effect-lane .range-body').filter({ hasText: name });
  // Repeatable effects have no Applied badge: reopen their existing bar instead of adding another.
  if (!(await bar.count()))
    await page.getByRole('button', { name: `Add ${name}`, exact: true }).click();
  await bar.first().click();
}

export async function selectFont(page: Page, name: string) {
  await page.getByRole('combobox', { name: 'Font', exact: true }).fill(name);
  await page.getByRole('option', { name, exact: true }).click();
}
