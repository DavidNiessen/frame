import type { Page } from '@playwright/test';

export async function openMobileMenu(page: Page) {
  const toggle = page.getByRole('button', { name: 'App menu', exact: true });
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
}
