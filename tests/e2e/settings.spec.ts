import { importTestMedia } from '../helpers/import-media';
import { test, expect } from '@playwright/test';

for (const choice of [
  {
    name: 'migrates Midnight to high contrast',
    saved: 'midnight',
    theme: 'high-contrast',
    label: 'High contrast theme',
  },
  {
    name: 'keeps Light text and panel boundaries clearly visible',
    saved: 'light',
    theme: 'light',
    label: 'Light theme',
  },
]) {
  test(choice.name, async ({ page }) => {
    await page.addInitScript((saved) => localStorage.setItem('frame-theme', saved), choice.saved);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', choice.theme);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('frame-theme')))
      .toBe(choice.theme);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('radio', { name: choice.label, exact: true })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Midnight theme', exact: true })).toHaveCount(0);
    const contrast = await page
      .locator('.settings-card')
      .first()
      .evaluate((card) => {
        const luminance = (color: string) => {
          const values = color
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map(Number)
            .map((value) => {
              const channel = value / 255;
              return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
            });
          return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
        };
        const style = getComputedStyle(card),
          background = luminance(style.backgroundColor);
        const ratio = (color: string) => {
          const foreground = luminance(color);
          return (
            (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05)
          );
        };
        return {
          text: ratio(getComputedStyle(card.querySelector('p')!).color),
          border: ratio(style.borderTopColor),
        };
      });
    expect(contrast.text).toBeGreaterThanOrEqual(7);
    expect(contrast.border).toBeGreaterThanOrEqual(3);
  });
}

test('shows disabled file-manager actions on web and previewed themes that persist', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('.desktop-chrome')).toHaveCount(0);
  await expect(page.locator('.app-header select')).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'System theme' })).toBeChecked();
  await expect(page.getByLabel('Show timeline preview')).toBeChecked();
  await page.getByLabel('Show timeline preview').uncheck();
  await expect(page.locator('.theme-preview')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Install actions' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Install actions' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Remove actions' })).toBeDisabled();
  await expect(
    page
      .locator('section[aria-labelledby="integration-heading"]')
      .getByText('Desktop only', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add watch folder', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Show saved exports' })).toBeDisabled();
  await expect(page.getByLabel('File context menu preview')).toHaveCount(0);
  await page.getByRole('radio', { name: 'Light theme', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('radio', { name: 'High contrast theme', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'high-contrast');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(
    page.getByRole('radio', { name: 'High contrast theme', exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: 'test-results/settings-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/settings-desktop.png', fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'High contrast theme', exact: true })).toBeChecked();
  await expect(page.getByLabel('Show timeline preview')).not.toBeChecked();
  await page.getByRole('radio', { name: 'System theme' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Back to workspace' }).click();
  await expect(page.getByRole('button', { name: 'Add media' })).toBeVisible();
});

test('preserves timeline edits and the conversion selection when navigating through settings', async ({
  page,
}) => {
  await page.goto('/');
  await importTestMedia(page);
  const start = page.getByLabel('Trim start', { exact: true });
  await expect(start).toBeVisible({ timeout: 45000 });
  await start.press('ArrowRight');
  const value = await start.getAttribute('aria-valuenow');
  await expect(page.locator('.timeline-overview')).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Show timeline preview').uncheck();
  await page.keyboard.press('i');
  await page.getByRole('button', { name: 'Back to workspace' }).click();
  await expect(start).toHaveAttribute('aria-valuenow', value!);
  await expect(page.locator('.timeline-overview')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Compact', exact: true })).toBeVisible();
  const workflows = page.getByRole('navigation', { name: 'Workflow' });
  await workflows.getByRole('button', { name: 'Convert', exact: true }).click();
  await page.getByLabel('Conversion format').selectOption('gif');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Back to workspace' }).click();
  await expect(workflows.getByRole('button', { name: 'Convert', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByLabel('Conversion format')).toHaveValue('gif');
  await expect(page.locator('.conversion-table tbody tr')).toHaveCount(1);
});
