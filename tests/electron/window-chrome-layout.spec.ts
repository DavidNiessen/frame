import { expect, test, _electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('keeps the video steady when chrome extends, handles resizing and preserves the maximized content area', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-chrome-layout-'));
  const executablePath = process.env.FRAME_TEST_EXECUTABLE ? resolve(process.env.FRAME_TEST_EXECUTABLE) : undefined;
  const app = await _electron.launch({ executablePath, args: [`--user-data-dir=${join(directory, 'profile')}`, ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []), ...(executablePath ? [] : ['.'])], env: { ...process.env, FRAME_DEV_URL: '' } });
  try {
    const page = await app.firstWindow(), native = await app.browserWindow(page);
    const show = async () => { const box = (await page.locator('.desktop-chrome-trigger').boundingBox())!; await page.mouse.move(100, box.y + 3); await expect(page.getByRole('toolbar', { name: 'Window controls' })).toBeVisible(); };
    const hide = async () => { await page.mouse.move(100, 300); await expect.poll(() => page.evaluate(() => window.frameDesktop!.windowState().then(state => state.chromeExpanded))).toBe(false); };
    const videoBounds = () => page.locator('video').evaluate(node => { const { x, y, width, height } = node.getBoundingClientRect(); return { x: x + screenX, y: y + screenY, width, height }; });
    await page.getByRole('button', { name: 'Try a sample', exact: true }).click();
    await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
    await page.getByRole('button', { name: 'Fullscreen preview', exact: true }).click();
    await page.locator('.preview-panel').evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
    const video = await videoBounds(); await show(); expect(await videoBounds()).toEqual(video); await hide(); expect(await videoBounds()).toEqual(video);
    await native.evaluate(window => { const bounds = window.getBounds(); window.setBounds({ ...bounds, width: 1200, height: 840 }); });
    await expect(page.locator('.desktop-window-frame')).toHaveCSS('height', '840px');
    await show();
    await native.evaluate(window => { const bounds = window.getBounds(); window.setBounds({ ...bounds, width: 1300, height: 896 }); });
    await expect(page.locator('.desktop-window-frame')).toHaveCSS('width', '1300px');
    await expect(page.locator('.desktop-window-frame')).toHaveCSS('height', '840px');
    const resized = await videoBounds(); await hide(); expect(await videoBounds()).toEqual(resized);
    const restoreBounds = await native.evaluate(window => window.getBounds());
    if (process.platform === 'linux') {
      // Xvfb has no window manager. Supply its maximize signal while retaining real native bounds and renderer layout.
      await app.evaluate(({ BrowserWindow, screen }) => {
        const window = BrowserWindow.getAllWindows()[0], original = window.isMaximized.bind(window), bounds = window.getBounds();
        window.isMaximized = () => true; window.setBounds(screen.getDisplayMatching(bounds).workArea); window.emit('maximize');
        (globalThis as typeof globalThis & { restoreChromeTest: () => void }).restoreChromeTest = () => { window.isMaximized = original; window.setBounds(bounds); window.emit('unmaximize'); };
      });
    } else await native.evaluate(window => window.maximize());
    await expect.poll(() => page.evaluate(() => window.frameDesktop!.windowState().then(state => state.maximized))).toBe(true);
    const dockedSize = await page.evaluate(() => window.frameDesktop!.windowState()), dockedBounds = await native.evaluate(window => window.getBounds());
    await expect(page.locator('.desktop-window-frame')).toHaveCSS('height', `${dockedSize.contentHeight}px`);
    await expect(page.locator('.desktop-window-frame')).toHaveCSS('width', `${dockedBounds.width}px`);
    const maximized = await videoBounds(), maximizedNative = await native.evaluate(window => window.getBounds());
    await show(); expect(await videoBounds()).toEqual(maximized); expect(await native.evaluate(window => window.getBounds())).toEqual(maximizedNative);
    await hide(); expect(await videoBounds()).toEqual(maximized); expect(await native.evaluate(window => window.getBounds())).toEqual(maximizedNative);
    if (process.platform === 'linux') await app.evaluate(() => (globalThis as typeof globalThis & { restoreChromeTest: () => void }).restoreChromeTest());
    else await native.evaluate(window => window.unmaximize());
    await expect.poll(() => native.evaluate(window => window.getBounds())).toEqual(restoreBounds);
    await expect(page.locator('.desktop-window-frame')).toHaveCSS('height', '840px');
    await show();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('radio', { name: 'Light theme', exact: true }).check();
    await show();
    const border = await page.locator('.app-header').evaluate(node => getComputedStyle(node).borderColor);
    await expect(page.locator('.desktop-titlebar')).toHaveCSS('border-color', border);
    await expect(page.locator('.desktop-window-frame')).toHaveCSS('border-color', border);
    await expect(page.locator('.desktop-titlebar')).toHaveCSS('background-color', await page.locator('.app-header').evaluate(node => getComputedStyle(node).backgroundColor));
    await page.screenshot({ path: 'test-results/desktop/raised-titlebar-light.png' });
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});
