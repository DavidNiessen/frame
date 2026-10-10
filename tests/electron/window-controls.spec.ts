import { expect, test, _electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { desktopChromeSpace } from '../../src/core/window-controls';

test('reveals frameless controls without moving panels, supports keyboard access and closes the window', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-window-controls-'));
  const executablePath = process.env.FRAME_TEST_EXECUTABLE ? resolve(process.env.FRAME_TEST_EXECUTABLE) : undefined;
  const app = await _electron.launch({ executablePath, args: [`--user-data-dir=${join(directory, 'profile')}`, ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []), ...(executablePath ? [] : ['.'])], env: { ...process.env, FRAME_DEV_URL: '' } });
  try {
    const page = await app.firstWindow(), native = await app.browserWindow(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    const bar = page.getByRole('toolbar', { name: 'Window controls' });
    const show = async () => { const box = (await page.locator('.desktop-chrome-trigger').boundingBox())!; await page.mouse.move(100, box.y + 3); };
    await expect(page.locator('.desktop-chrome')).toHaveAttribute('data-visible', 'false');
    await expect(bar).toBeHidden();
    expect(await native.evaluate(window => window.getContentBounds())).toEqual(await native.evaluate(window => window.getBounds()));
    await page.evaluate(() => document.fonts.ready);
    const contentBounds = () => page.locator('.empty-stage').evaluate(node => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x: x + screenX, y: y + screenY, width, height };
    });
    const before = await contentBounds(), initialNative = await native.evaluate(window => window.getBounds());
    await show();
    await expect(bar).toBeVisible();
    const frames = await page.locator('.empty-stage').evaluate(async node => {
      const boxes = [];
      for (let index = 0; index < 8; index++) { await new Promise(requestAnimationFrame); const { x, y, width, height } = node.getBoundingClientRect(); boxes.push({ content: { x: x + screenX, y: y + screenY, width, height }, chromeTop: document.querySelector('.desktop-window-frame')!.getBoundingClientRect().top }); }
      return boxes;
    });
    for (const frame of frames) expect(frame.content).toEqual(before);
    expect(frames.some(frame => frame.chromeTop > 0 && frame.chromeTop < desktopChromeSpace)).toBe(true);
    for (let index = 1; index < frames.length; index++) expect(frames[index].chromeTop).toBeLessThanOrEqual(frames[index - 1].chromeTop);
    await page.locator('.desktop-window-frame').evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
    expect(await contentBounds()).toEqual(before);
    const raisedNative = await native.evaluate(window => window.getBounds());
    expect(raisedNative).toEqual(initialNative);
    const chrome = (await bar.boundingBox())!, frame = (await page.locator('.desktop-window-frame').boundingBox())!, content = (await page.locator('.desktop-window-content').boundingBox())!;
    expect(chrome.x).toBe(frame.x + 1); expect(chrome.width).toBe(frame.width - 2); expect(chrome.y + chrome.height).toBeCloseTo(content.y, 0);
    await expect(bar).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(bar).toHaveCSS('border-width', '0px');
    await expect(page.locator('.desktop-window-frame')).toHaveCSS('border-radius', '14px');
    await expect(bar.locator('img, .brand')).toHaveCount(0);
    expect(await bar.innerText()).toBe('');
    await page.screenshot({ path: 'test-results/desktop/custom-titlebar.png' });
    // Re-entering during the hide delay must not prevent the next automatic hide.
    await page.mouse.move(100, 100); await show();
    await expect(bar).toBeVisible();
    await page.mouse.move(100, 300);
    await expect(bar).toBeHidden();
    await page.locator('.desktop-window-frame').evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
    await expect.poll(() => native.evaluate(window => window.getBounds())).toEqual(initialNative);
    expect(await contentBounds()).toEqual(before);
    await page.getByRole('button', { name: 'Add media', exact: true }).focus();
    await page.keyboard.press('Control+Shift+Space');
    await expect(page.getByRole('button', { name: 'Minimize window' })).toBeFocused();
    await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Maximize window' })).toBeFocused();
    await page.keyboard.press('Escape'); await expect(bar).toBeHidden();
    await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeFocused();
    // Fullscreen pins the controls even when the pointer leaves the top edge.
    if (process.platform === 'linux') {
      // Xvfb has no window manager; emit the fullscreen signal through the real native bridge.
      await app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0], original = window.isFullScreen.bind(window);
        window.isFullScreen = () => true; window.emit('enter-full-screen');
        (globalThis as typeof globalThis & { restoreFullscreenTest: () => void }).restoreFullscreenTest = () => { window.isFullScreen = original; window.emit('leave-full-screen'); };
        return true;
      });
    } else await native.evaluate(window => window.setFullScreen(true));
    await expect(bar).toBeVisible();
    await page.mouse.move(100, 400);
    await expect(page.getByRole('button', { name: 'Restore window', exact: true })).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(bar).toBeVisible();
    expect((await page.evaluate(() => window.frameDesktop!.setWindowChrome(false))).chromeExpanded).toBe(true);
    await expect(bar).toBeVisible();
    if (process.platform === 'linux') await app.evaluate(() => { (globalThis as typeof globalThis & { restoreFullscreenTest: () => void }).restoreFullscreenTest(); return true; });
    else await native.evaluate(window => window.setFullScreen(false));
    await expect(bar).toBeHidden();
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
    await show();
    await page.getByRole('button', { name: 'Minimize window' }).click();
    await expect.poll(() => app.evaluate(() => (globalThis as typeof globalThis & { chromeActions: string[] }).chromeActions.at(-1))).toBe('minimize');
    if (process.platform !== 'linux') await expect.poll(() => native.evaluate(window => window.isMinimized())).toBe(true);
    await native.evaluate(window => { window.restore(); window.show(); window.focus(); });
    await page.mouse.move(100, 300); await show();
    await page.getByRole('button', { name: 'Maximize window' }).click();
    await expect.poll(() => app.evaluate(() => (globalThis as typeof globalThis & { chromeActions: string[] }).chromeActions.at(-1))).toBe('maximize');
    if (process.platform !== 'linux') {
      await expect.poll(() => native.evaluate(window => window.isMaximized())).toBe(true);
      await page.mouse.move(100, 400);
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await expect(page.getByRole('button', { name: 'Restore window' })).toBeVisible();
      await page.getByRole('button', { name: 'Restore window' }).click();
      await expect.poll(() => native.evaluate(window => window.isMaximized())).toBe(false);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.mouse.move(100, 300); await expect(bar).toBeHidden();
    await show(); await expect(bar).toBeVisible();
    await expect(page.locator('.desktop-titlebar')).toHaveCSS('transition-duration', '0s');
    const closed = page.waitForEvent('close');
    await page.getByRole('button', { name: 'Close window' }).click().catch(error => { if (!page.isClosed()) throw error; });
    await closed;
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});
