import { test, expect, _electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { nativeMacChromeSpace } from '../../src/core/window-controls';

test('uses native macOS traffic lights with a stable title-bar area', async () => {
  test.skip(process.platform !== 'darwin', 'Native traffic lights are supplied by macOS.');
  const directory = await mkdtemp(join(tmpdir(), 'frame-native-controls-'));
  const executablePath = process.env.FRAME_TEST_EXECUTABLE
    ? resolve(process.env.FRAME_TEST_EXECUTABLE)
    : undefined;
  const application = await _electron.launch({
    executablePath,
    args: [`--user-data-dir=${directory}`, ...(executablePath ? [] : ['.'])],
    env: { ...process.env, FRAME_DEV_URL: '' },
  });
  try {
    const page = await application.firstWindow(),
      native = await application.browserWindow(page);
    expect(await page.evaluate(() => window.frameDesktop!.nativeWindowControls)).toBe(true);
    expect(await native.evaluate((window) => window.getWindowButtonPosition())).toEqual({
      x: 14,
      y: 9,
    });
    await expect(page.locator('.desktop-native-titlebar')).toBeVisible();
    await expect(page.locator('.desktop-window-buttons, .desktop-chrome')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Install App', exact: true })).toHaveCount(0);
    await expect(page.locator('.desktop-native-titlebar')).toHaveCSS(
      'height',
      `${nativeMacChromeSpace}px`,
    );
    const content = page.locator('.desktop-window-content');
    const before = await content.boundingBox();
    await page.mouse.move(120, 3);
    await page.mouse.move(120, 400);
    expect(await content.boundingBox()).toEqual(before);
    expect(
      (await page.evaluate(() => window.frameDesktop!.setWindowChrome(false))).chromeExpanded,
    ).toBe(true);
    expect(await content.boundingBox()).toEqual(before);
    // Exercise the real native fullscreen transition; do not supply replacement DOM controls.
    await native.evaluate((window) => window.setFullScreen(true));
    await expect
      .poll(() => page.evaluate(async () => (await window.frameDesktop!.windowState()).fullscreen))
      .toBe(true);
    await expect(page.locator('.desktop-window-frame')).toHaveCSS('border-radius', '0px');
    await expect(page.locator('.desktop-window-buttons')).toHaveCount(0);
    await native.evaluate((window) => window.setFullScreen(false));
    await expect
      .poll(() => page.evaluate(async () => (await window.frameDesktop!.windowState()).fullscreen))
      .toBe(false);
    await expect(page.locator('.desktop-native-titlebar')).toBeVisible();
    expect(await native.evaluate((window) => window.getWindowButtonPosition())).toEqual({
      x: 14,
      y: 9,
    });
    await page.screenshot({ path: 'test-results/desktop/native-macos-controls.png' });
  } finally {
    await application.close();
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
