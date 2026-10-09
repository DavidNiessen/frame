import { test, expect } from '@playwright/test';
test('guides Windows certificate approval, recovers from cancellation and offers revocation without layout overflow', async ({ page }) => {
  await page.addInitScript(() => {
    let trustAttempts = 0;
    let status = { platform: 'win32', available: true, state: 'partial', detail: 'Classic entries remain available.', certificate: { canTrust: true, trusted: false, subject: 'CN=Frame', fingerprint: 'a'.repeat(64), expiresAt: '2031-10-08T00:00:00Z' } };
    window.frameDesktop = {
      nextLaunch: async () => null, onLaunchAvailable: () => () => {},
      shellIntegrationStatus: async () => status,
      setShellIntegration: async () => { throw new Error('Certificate approval must use the certificate API.'); },
      changeShellCertificate: async (action: string) => {
        if (action === 'trust' && ++trustAttempts === 1) throw new Error('Administrator approval was cancelled. Certificate trust was not changed.');
        status = { ...status, state: action === 'trust' ? 'installed' : 'not-installed', certificate: { ...status.certificate, trusted: action === 'trust' } };
        return status;
      },
    } as unknown as NonNullable<Window['frameDesktop']>;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const trust = page.getByRole('button', { name: 'Trust certificate and enable menu…', exact: true });
  await expect(trust).toBeEnabled();
  await page.getByText('Certificate details', { exact: true }).click();
  await expect(page.getByText('Trusted People, for all users of this PC', { exact: true })).toBeVisible();
  await trust.click();
  await expect(page.getByRole('alert')).toContainText('Administrator approval was cancelled');
  await expect(trust).toBeEnabled();
  await expect(page.locator('.integration-badge')).toHaveText('Needs repair');
  await trust.click();
  await expect(page.locator('.integration-badge')).toHaveText('Installed');
  await expect(page.getByText('Frame certificate trusted on this PC', { exact: true })).toBeVisible();
  const revoke = page.getByRole('button', { name: 'Remove certificate trust…', exact: true });
  await expect(revoke).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/certificate-trust-mobile.png', fullPage: true });
  await revoke.click();
  await expect(page.locator('.integration-badge')).toHaveText('Not installed');
  await expect(trust).toBeEnabled();
});
