import { test, expect } from '@playwright/test';
import { openMobileMenu } from '../helpers/header';

test('keeps project actions in a single responsive header with usable menus', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('.workspace-bar')).toHaveCount(0);
  const header = page.locator('.app-header');
  const tools = header.getByLabel('Project tools', { exact: true });
  for (const width of [1440, 1101, 1100, 1024, 901, 900, 820, 701, 700, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await openMobileMenu(page);
    await expect(tools).toBeVisible();
    await expect(header.getByRole('button', { name: 'Save project', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // The workflow and project actions occupy distinct space at every breakpoint.
    const nav = (await header.getByRole('navigation', { name: 'Workflow' }).boundingBox())!;
    const actions = (await header.locator('.workspace-actions').boundingBox())!;
    if (width > 700) expect(nav.x + nav.width).toBeLessThanOrEqual(actions.x);
    await tools.click();
    const open = page.getByRole('button', { name: 'Open project', exact: true });
    await expect(open).toBeVisible();
    const menu = (await header.locator('.workspace-tools-menu').boundingBox())!;
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(width);
    await open.focus(); await page.keyboard.press('Escape');
    await expect(open).toBeHidden(); await expect(tools).toBeFocused();
    if (width <= 700) {
      await page.keyboard.press('Escape');
      await expect(header.getByRole('button', { name: 'App menu', exact: true })).toBeFocused();
      await expect(tools).toBeHidden();
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ animations: 'disabled', path: 'test-results/frame-header-phone.png' });
  await openMobileMenu(page);
  await page.screenshot({ animations: 'disabled', path: 'test-results/frame-header-phone-menu.png' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ animations: 'disabled', path: 'test-results/frame-header-desktop.png' });
});

test('saves from the compact header and opens projects without losing workflow navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample', exact: true }).click();
  const header = page.locator('.app-header');
  await openMobileMenu(page);
  await expect(header.getByRole('button', { name: 'Save project', exact: true })).toBeEnabled({ timeout: 45000 });
  const downloaded = page.waitForEvent('download');
  await header.getByRole('button', { name: 'Save project', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/\.frame\.json$/);
  await expect(header.getByRole('button', { name: 'App menu', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await openMobileMenu(page);
  await header.getByLabel('Project tools', { exact: true }).click();
  await expect(header.locator('.project-menu-name')).not.toBeEmpty();
  const chooser = page.waitForEvent('filechooser');
  await header.getByRole('button', { name: 'Open project', exact: true }).click();
  expect((await chooser).isMultiple()).toBe(false);
  await expect(header.locator('.workspace-tools')).not.toHaveAttribute('open');
  await header.getByRole('button', { name: 'Convert', exact: true }).click();
  await expect(header.getByLabel('Project tools', { exact: true })).toHaveCount(0);
  await openMobileMenu(page); await header.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to workspace', exact: true }).click();
  await header.getByRole('button', { name: 'Editor', exact: true }).click();
  await openMobileMenu(page);
  await expect(header.getByLabel('Project tools', { exact: true })).toBeVisible();
});

test('opens the mobile menu with the keyboard, restores focus after search and dismisses outside', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  const toggle = page.getByRole('button', { name: 'App menu', exact: true });
  await toggle.focus(); await toggle.press('Space');
  await page.keyboard.press('Tab'); await expect(page.getByLabel('Project tools', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Search commands', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Search commands', exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click(); await page.getByRole('link', { name: 'Frame home', exact: true }).click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});
