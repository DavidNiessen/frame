import { expect, test, _electron } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('persists native notification preference and sends completion notices only in the background', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-notification-test-'));
  const app = await _electron.launch({ args: [`--user-data-dir=${join(directory, 'profile')}`, ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []), '.'], env: { ...process.env, FRAME_DEV_URL: '' } });
  try {
    await app.evaluate(({ Notification, BrowserWindow }) => {
      const state = globalThis as typeof globalThis & { notices: string[]; focused: boolean }; state.notices = []; state.focused = true;
      Notification.isSupported = () => true; Notification.prototype.show = function () { state.notices.push(this.body); };
      BrowserWindow.prototype.isFocused = () => state.focused;
    });
    const page = await app.firstWindow(); await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const toggle = page.getByLabel('Notify when processing finishes', { exact: true }); await expect(toggle).toBeEnabled(); await expect(toggle).toBeChecked();
    const send = () => page.evaluate(() => window.frameDesktop!.notifyCompletion({ kind: 'conversion', total: 3, completed: 2, failed: 1 }));
    await send(); expect(await app.evaluate(() => (globalThis as typeof globalThis & { notices: string[] }).notices)).toEqual([]);
    await app.evaluate(() => { (globalThis as typeof globalThis & { focused: boolean }).focused = false; }); await send();
    expect(await app.evaluate(() => (globalThis as typeof globalThis & { notices: string[] }).notices)).toEqual(['2 files saved. 1 file needs attention.']);
    await toggle.uncheck(); await expect(toggle).not.toBeChecked(); await send(); expect(await app.evaluate(() => (globalThis as typeof globalThis & { notices: string[] }).notices.length)).toBe(1);
    expect(JSON.parse(await readFile(join(directory, 'profile', 'completion-notifications.json'), 'utf8')).enabled).toBe(false);
    await expect(page.evaluate(() => window.frameDesktop!.notifyCompletion({ kind: 'export', total: 1, completed: 4, failed: 0 }))).rejects.toThrow('Invalid completion');
    await page.reload(); await page.getByRole('button', { name: 'Settings', exact: true }).click(); await expect(toggle).not.toBeChecked();
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});
