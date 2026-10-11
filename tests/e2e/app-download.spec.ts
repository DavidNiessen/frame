import { test, expect, type Page } from '@playwright/test';
import { FRAME_RELEASES, FRAME_RELEASES_API, installerName } from '../../src/core/app-updates';

function release(tag: string) {
  const names = [
    ['win32', 'x64'],
    ['darwin', 'arm64'],
    ['darwin', 'x64'],
    ['linux', 'x64'],
  ].map(([platform, arch]) => installerName(tag.slice(1).split('-')[0], platform, arch)!);
  return {
    tag_name: tag,
    prerelease: tag.includes('-build.'),
    draft: false,
    assets: [...names, 'SHA256SUMS.txt'].map((name) => ({
      name,
      size: 180 * 1024 ** 2,
      browser_download_url: `${FRAME_RELEASES}/download/${tag}/${name}`,
    })),
  };
}
async function windows(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgentData', {
      value: {
        platform: 'Windows',
        mobile: false,
        getHighEntropyValues: async () => ({ architecture: 'x86', bitness: '64' }),
      },
    });
  });
}
async function fixtures(page: Page) {
  await page.route(`${FRAME_RELEASES_API}**`, (route) =>
    route.fulfill({
      json: route.request().url().includes('/latest')
        ? release('v1.0.0')
        : [release('v1.0.1-build.9'), release('v1.0.0'), release('v1.0.1-build.10')],
    }),
  );
}

test('detects the platform, switches channels and downloads the exact GitHub installer', async ({
  page,
}) => {
  await windows(page);
  await fixtures(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Download App', exact: true });
  await trigger.click();
  const modal = page.getByRole('dialog', { name: 'More room to create.' });
  await expect(modal).toBeVisible();
  await expect(modal.getByLabel('Operating system')).toHaveValue('win32');
  await expect(modal.getByLabel('Architecture')).toHaveValue('x64');
  await expect(modal.getByLabel('Download the latest prerelease')).not.toBeChecked();
  const button = modal.getByRole('link', { name: 'Download for Windows x64' });
  await expect(button).toHaveAttribute(
    'href',
    `${FRAME_RELEASES}/download/v1.0.0/Frame-1.0.0-win-x64.exe`,
  );
  await expect(modal.getByRole('link', { name: 'View all GitHub releases' })).toHaveAttribute(
    'href',
    FRAME_RELEASES,
  );
  await page.route(`${FRAME_RELEASES}/download/**`, (route) =>
    route.fulfill({
      contentType: 'application/octet-stream',
      headers: { 'Content-Disposition': 'attachment; filename="Frame-1.0.0-win-x64.exe"' },
      body: 'fixture installer',
    }),
  );
  const downloaded = page.waitForEvent('download');
  await button.click();
  expect((await downloaded).suggestedFilename()).toBe('Frame-1.0.0-win-x64.exe');
  await expect(modal).toContainText('Download requested');
  await modal.getByLabel('Download the latest prerelease').check();
  await expect(button).toHaveAttribute(
    'href',
    `${FRAME_RELEASES}/download/v1.0.1-build.10/Frame-1.0.1-win-x64.exe`,
  );
  await modal.getByLabel('Operating system').selectOption('darwin');
  await modal.getByLabel('Architecture').selectOption('arm64');
  await expect(modal.getByRole('link', { name: 'Download for macOS ARM64' })).toHaveAttribute(
    'href',
    `${FRAME_RELEASES}/download/v1.0.1-build.10/Frame-1.0.1-mac-arm64.dmg`,
  );
  await page.screenshot({ animations: 'disabled', path: 'test-results/app-download-desktop.png' });
  await modal.getByLabel('Close app download').click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('keeps the download visible on phones and asks for a desktop target', async ({ page }) => {
  await fixtures(page);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'userAgentData', {
      value: { mobile: true, platform: 'Android' },
    }),
  );
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Download App', exact: true });
  await expect(trigger).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await trigger.click();
  const modal = page.getByRole('dialog', { name: 'More room to create.' });
  await expect(modal.getByLabel('Operating system')).toHaveValue('');
  await expect(modal.getByLabel('Architecture')).toHaveValue('');
  await modal.getByLabel('Operating system').selectOption('linux');
  await modal.getByLabel('Architecture').selectOption('arm64');
  await expect(modal).toContainText('No full release installer is available');
  await expect(modal.getByRole('link', { name: /Download for/ })).toHaveCount(0);
  await modal.getByLabel('Architecture').selectOption('x64');
  await expect(modal.getByRole('link', { name: 'Download for Linux x64' })).toBeInViewport();
  await expect(modal.getByRole('link', { name: 'View all GitHub releases' })).toBeInViewport();
  await page.screenshot({ animations: 'disabled', path: 'test-results/app-download-phone.png' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await modal.getByLabel('Close app download').click();
  await expect(trigger.locator('svg')).toHaveCSS('animation-name', 'none');
});

test('handles missing full releases and recovers from GitHub errors', async ({ page }) => {
  await windows(page);
  await page.route(`${FRAME_RELEASES_API}**`, (route) =>
    route.fulfill({ status: 404, json: { message: 'Not Found' } }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Download App', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'More room to create.' });
  await expect(modal).toContainText('No full release has been published yet');
  await expect(modal.getByRole('button', { name: 'Download Frame' })).toBeDisabled();
  await page.route(`${FRAME_RELEASES_API}**`, (route) =>
    route.fulfill({ status: 403, json: { message: 'rate limited' } }),
  );
  await modal.getByLabel('Download the latest prerelease').check();
  await expect(modal.getByRole('alert')).toContainText('request limit');
  await fixtures(page);
  await modal.getByRole('button', { name: 'Try again' }).click();
  await expect(modal.getByRole('link', { name: 'Download for Windows x64' })).toBeVisible();
});
