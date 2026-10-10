import { windowsPowerShellEnv } from '../../scripts/windows-powershell-env.mjs';
import { test, expect, _electron } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { BaseWindow, MessageBoxOptions } from 'electron';

const execute = promisify(execFile);
async function windowsRegistry(script: string) {
  const { stdout } = await execute(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { env: windowsPowerShellEnv() });
  return stdout.trim();
}

test('manages file-manager actions in packaged and development builds', async () => {
  test.setTimeout(120000);
  const directory = await mkdtemp(join(tmpdir(), 'frame-settings-'));
  const executablePath = process.env.FRAME_TEST_EXECUTABLE ? resolve(process.env.FRAME_TEST_EXECUTABLE) : undefined;
  const app = await _electron.launch({ executablePath, args: [`--user-data-dir=${join(directory, 'profile')}`, ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []), ...(executablePath ? [] : ['.'])], env: { ...process.env, FRAME_DEV_URL: '', XDG_DATA_HOME: join(directory, 'data') } });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    // Finder tests use temporary Services folders in the unit suite. Never alter real user services here.
    test.skip(process.platform === 'darwin', 'Real Finder integration is validated separately.');
    test.skip(process.platform === 'win32' && process.env.FRAME_TEST_SHELL_ACTIONS !== '1', 'Run Windows registration checks through the isolated installer test.');
    const status = () => page.evaluate(() => window.frameDesktop!.shellIntegrationStatus());
    await expect(page.evaluate(() => window.frameDesktop!.setShellIntegration('invalid' as unknown as boolean))).rejects.toThrow('Invalid integration setting');
    await expect(page.evaluate(() => window.frameDesktop!.changeShellCertificate('invalid' as 'trust'))).rejects.toThrow('Invalid certificate action');
    if (process.platform === 'linux') await expect(page.evaluate(() => window.frameDesktop!.changeShellCertificate('trust'))).rejects.toThrow('Windows 11');
    const initial = await status();
    expect(initial.available).toBe(true);
    await expect(page.getByLabel('File context menu preview')).toHaveCount(0);
    if (initial.state !== 'not-installed') {
      await page.getByRole('button', { name: 'Remove actions' }).click();
      await expect(page.locator('section[aria-labelledby="integration-heading"] .integration-badge')).toHaveText('Not installed');
    }
    await page.getByRole('button', { name: 'Install actions' }).click();
    await expect(page.locator('section[aria-labelledby="integration-heading"] .integration-badge')).toHaveText('Installed');
    await expect(page.getByRole('button', { name: 'Install actions' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Remove actions' })).toBeEnabled();
    if (process.platform === 'win32' && initial.certificate?.trusted) {
      await expect(page.getByRole('button', { name: 'Remove certificate trust…' })).toBeEnabled();
      await app.evaluate(({ dialog }) => { dialog.showMessageBox = async (first: BaseWindow | MessageBoxOptions, second?: MessageBoxOptions) => {
        const options = (second ?? first) as MessageBoxOptions;
        if (!options.detail?.includes('Trusted People for all users') || options.defaultId !== 0) throw new Error('Certificate revocation must explain scope and default to Cancel.');
        return { response: 0, checkboxChecked: false };
      }; });
      await page.getByRole('button', { name: 'Remove certificate trust…' }).click();
      await expect(page.getByRole('button', { name: 'Remove certificate trust…' })).toBeEnabled();
      expect((await status()).certificate?.trusted).toBe(true);
      expect((await status()).state).toBe('installed');
    }
    if (process.platform === 'linux') {
      const path = join(directory, 'data', 'kio', 'servicemenus', 'frame-media-editor.desktop');
      const entry = await readFile(path, 'utf8');
      expect(entry).toContain('--frame-workflow=convert');
      const launch = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, path: app.getAppPath() }));
      if (!launch.packaged) expect(entry).toContain(`"${launch.path}" --frame-workflow=convert`);
      await writeFile(path, 'stale command');
      await page.getByRole('button', { name: 'Refresh integration status' }).click();
      await expect(page.locator('section[aria-labelledby="integration-heading"] .integration-badge')).toHaveText('Needs repair');
      await page.getByRole('button', { name: 'Repair actions' }).click();
      await expect(page.locator('section[aria-labelledby="integration-heading"] .integration-badge')).toHaveText('Installed');
    }
    if (process.platform === 'win32') {
      // Windows 11 checks the native component separately from the classic registry verbs.
      const primary = await windowsRegistry(`$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\\Frame\\ShellActions'); try { $key.GetValue('PrimaryPackage') } finally { $key.Dispose() }`);
      if (primary) {
        await expect(page.locator('section[aria-labelledby="integration-heading"] .integration-detail')).toContainText('Windows 11 primary menu installed');
        await windowsRegistry(`$key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Software\\Frame\\ShellActions'); try { $key.SetValue('PrimaryDigest', 'stale-package') } finally { $key.Dispose() }`);
        await page.getByRole('button', { name: 'Refresh integration status' }).click();
        await expect(page.locator('section[aria-labelledby="integration-heading"] .integration-badge')).toHaveText('Needs repair');
        await page.getByRole('button', { name: 'Repair actions' }).click();
        await expect(page.locator('section[aria-labelledby="integration-heading"] .integration-badge')).toHaveText('Installed');
        const mode = await windowsRegistry(`$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\\Frame\\ShellActions'); try { $key.GetValue('PrimaryMode') } finally { $key.Dispose() }`);
        if (mode === 'development') {
          await windowsRegistry(`$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\\Frame\\ShellActions'); try { Set-Content -LiteralPath (Join-Path ($key.GetValue('PrimaryRoot')) 'Assets\\Logo44.png') -Value 'damaged' } finally { $key.Dispose() }`);
          await page.getByRole('button', { name: 'Refresh integration status' }).click();
          await expect(page.locator('section[aria-labelledby="integration-heading"] .integration-badge')).toHaveText('Needs repair');
          await page.getByRole('button', { name: 'Repair actions' }).click();
          await expect(page.locator('section[aria-labelledby="integration-heading"] .integration-badge')).toHaveText('Installed');
        }
      }
      // A different Frame installation can own one verb; removal must leave that command alone.
      await windowsRegistry(`$key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Software\\Classes\\SystemFileAssociations\\.mp3\\shell\\Frame.Convert\\command'); $key.SetValue('', 'other-installation'); $key.Dispose()`);
      await page.getByRole('button', { name: 'Refresh integration status' }).click();
      await expect(page.locator('section[aria-labelledby="integration-heading"] .integration-badge')).toHaveText('Needs repair');
    }
    await page.getByRole('button', { name: 'Remove actions' }).click();
    await expect(page.locator('section[aria-labelledby="integration-heading"] .integration-badge')).toHaveText('Not installed');
    expect((await status()).state).toBe('not-installed');
    if (process.platform === 'win32') {
      expect(await windowsRegistry(`$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\\Classes\\SystemFileAssociations\\.mp3\\shell\\Frame.Convert\\command'); try { $key.GetValue('') } finally { $key.Dispose() }`)).toBe('other-installation');
      expect(await windowsRegistry(`$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\\Frame\\ShellActions'); try { $key.GetValue('Enabled') } finally { $key.Dispose() }`)).toBe('0');
    }
    if (process.platform === 'linux') await expect(readFile(join(directory, 'data', 'kio', 'servicemenus', 'frame-media-editor.desktop'))).rejects.toThrow();
    // Windows installer launch tests still need the registrations enabled.
    if (initial.state === 'installed') {
      await page.getByRole('button', { name: 'Install actions' }).click();
      await expect(page.locator('section[aria-labelledby="integration-heading"] .integration-badge')).toHaveText('Installed');
    }
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});
