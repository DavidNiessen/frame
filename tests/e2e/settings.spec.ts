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
  const historySpacing = await page
    .locator('.settings-history')
    .evaluate(
      (card) =>
        card.querySelector('button')!.getBoundingClientRect().top -
        card.querySelector('.settings-section-heading')!.getBoundingClientRect().bottom,
    );
  expect(historySpacing).toBeGreaterThanOrEqual(16);
  await expect(page.getByRole('button', { name: 'Check for updates' })).toBeDisabled();
  await expect(page.getByLabel('Check for updates automatically')).toBeDisabled();
  await expect(page.getByLabel('Include prereleases')).toBeDisabled();
  await expect(page.locator('section[aria-labelledby="updates-heading"]')).toContainText(
    'Reload to get the latest version',
  );
  await expect(page.getByLabel('File context menu preview')).toHaveCount(0);
  await page.getByRole('radio', { name: 'Light theme', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('radio', { name: 'High contrast theme', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'high-contrast');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page
    .getByRole('radio', { name: 'High contrast theme', exact: true })
    .scrollIntoViewIfNeeded();
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

test('Escape closes Settings and restores focus after a nested dialog closes first', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
});

for (const viewport of [
  { width: 1440, height: 700 },
  { width: 390, height: 667 },
]) {
  test(`scrolls Settings opened from Convert at ${viewport.width}px and restores the conversion layout`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const workflows = page.getByRole('navigation', { name: 'Workflow' });
    await workflows.getByRole('button', { name: 'Convert', exact: true }).click();
    await page.getByLabel('Choose media files').setInputFiles('tests/fixtures/sample.mp4');
    await expect(page.locator('.conversion-table tbody tr')).toHaveCount(1);
    await page.getByLabel('Conversion format').selectOption('gif');
    if (viewport.width < 700)
      await page.getByRole('button', { name: 'App menu', exact: true }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    await page.mouse.wheel(0, 600);
    await expect
      .poll(() => page.evaluate(() => document.scrollingElement!.scrollTop))
      .toBeGreaterThan(0);
    await page
      .getByRole('heading', { name: 'Recent exports', exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole('heading', { name: 'Recent exports', exact: true }),
    ).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Conversion format')).toHaveValue('gif');
    expect(
      await page.evaluate(() => ({
        width: document.documentElement.scrollWidth - innerWidth,
        height: document.documentElement.scrollHeight - innerHeight,
      })),
    ).toEqual({ width: 0, height: 0 });
    await expect(page.locator('.conversion-table tbody tr')).toHaveCount(1);
    await expect(
      page.getByRole('button', { name: 'Convert 1 file', exact: true }),
    ).toBeInViewport();
    await expect(page.locator('.app-footer')).toBeInViewport();
  });
}

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
