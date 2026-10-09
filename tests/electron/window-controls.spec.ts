import { expect, test, _electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('reveals frameless controls without moving panels, supports keyboard access and closes the window', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-window-controls-'));
  const executablePath = process.env.FRAME_TEST_EXECUTABLE ? resolve(process.env.FRAME_TEST_EXECUTABLE) : undefined;
  const app = await _electron.launch({ executablePath, args: [`--user-data-dir=${join(directory, 'profile')}`, ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []), ...(executablePath ? [] : ['.'])], env: { ...process.env, FRAME_DEV_URL: '' } });
  try {
    const page = await app.firstWindow(), native = await app.browserWindow(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    const bar = page.getByRole('toolbar', { name: 'Window controls' });
    await expect(page.locator('.desktop-chrome')).toHaveAttribute('data-visible', 'false');
    await expect(bar).toBeHidden();
    expect(await native.evaluate(window => window.getContentBounds())).toEqual(await native.evaluate(window => window.getBounds()));
    await page.evaluate(() => document.fonts.ready);
    const before = await page.locator('.empty-stage').boundingBox();
    await page.mouse.move(100, 3);
    await expect(bar).toBeVisible();
    const frames = await page.locator('.empty-stage').evaluate(async node => {
      const boxes = [];
      for (let index = 0; index < 8; index++) { await new Promise(requestAnimationFrame); const { x, y, width, height } = node.getBoundingClientRect(); boxes.push({ x, y, width, height }); }
      return boxes;
    });
    for (const frame of frames) expect(frame).toEqual(before);
    await page.locator('.desktop-titlebar').evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
    expect(await page.locator('.empty-stage').boundingBox()).toEqual(before);
    await expect(bar.locator('img, .brand')).toHaveCount(0);
    expect(await bar.innerText()).toBe('');
    await page.screenshot({ path: 'test-results/desktop/custom-titlebar.png' });
    // Re-entering during the hide delay must not prevent the next automatic hide.
    await page.mouse.move(100, 100); await page.mouse.move(100, 3);
    await expect(bar).toBeVisible();
    await page.mouse.move(100, 300);
    await expect(bar).toBeHidden();
    expect(await page.locator('.empty-stage').boundingBox()).toEqual(before);
    await page.getByRole('button', { name: 'Try a sample', exact: true }).focus();
    await page.keyboard.press('Control+Shift+Space');
    await expect(page.getByRole('button', { name: 'Minimize window' })).toBeFocused();
    await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Maximize window' })).toBeFocused();
    await page.keyboard.press('Escape'); await expect(bar).toBeHidden();
    await expect(page.getByRole('button', { name: 'Try a sample', exact: true })).toBeFocused();
    // Xvfb has no window manager; observe native calls there and real window state on other platforms.
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const actions: string[] = [];
      (globalThis as typeof globalThis & { chromeActions: string[] }).chromeActions = actions;
      for (const method of ['minimize', 'maximize', 'unmaximize'] as const) {
        const original = window[method].bind(window);
        window[method] = () => { actions.push(method); original(); };
      }
    });
    // Reject arbitrary actions rather than dispatching arbitrary BrowserWindow methods.
    expect(await page.evaluate(async () => { try { await window.frameDesktop!.windowAction('destroy' as 'close'); return false; } catch { return true; } })).toBe(true);
    await page.mouse.move(100, 3);
    await page.getByRole('button', { name: 'Minimize window' }).click();
    await expect.poll(() => app.evaluate(() => (globalThis as typeof globalThis & { chromeActions: string[] }).chromeActions.at(-1))).toBe('minimize');
    if (process.platform !== 'linux') await expect.poll(() => native.evaluate(window => window.isMinimized())).toBe(true);
    await native.evaluate(window => { window.restore(); window.show(); window.focus(); });
    await page.mouse.move(100, 300); await page.mouse.move(100, 3);
    await page.getByRole('button', { name: 'Maximize window' }).click();
    await expect.poll(() => app.evaluate(() => (globalThis as typeof globalThis & { chromeActions: string[] }).chromeActions.at(-1))).toBe('maximize');
    if (process.platform !== 'linux') {
      await expect.poll(() => native.evaluate(window => window.isMaximized())).toBe(true);
      await expect(page.getByRole('button', { name: 'Restore window' })).toBeVisible();
      await page.getByRole('button', { name: 'Restore window' }).click();
      await expect.poll(() => native.evaluate(window => window.isMaximized())).toBe(false);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.mouse.move(100, 300); await expect(bar).toBeHidden();
    await page.mouse.move(100, 3); await expect(bar).toBeVisible();
    await expect(page.locator('.desktop-titlebar')).toHaveCSS('transition-duration', '0s');
    const closed = page.waitForEvent('close');
    await page.getByRole('button', { name: 'Close window' }).click().catch(error => { if (!page.isClosed()) throw error; });
    await closed;
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});
