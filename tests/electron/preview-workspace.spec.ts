import { importTestMedia } from '../helpers/import-media';
import { test, expect, _electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('expands the desktop workspace and plays from focused timeline controls', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-preview-workspace-'));
  const executablePath = process.env.FRAME_TEST_EXECUTABLE ? resolve(process.env.FRAME_TEST_EXECUTABLE) : undefined;
  const app = await _electron.launch({ executablePath, args: [`--user-data-dir=${join(directory, 'profile')}`, ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []), ...(executablePath ? [] : ['.'])], env: { ...process.env, FRAME_DEV_URL: '' } });
  try {
    const page = await app.firstWindow();
    await importTestMedia(page, app);
    await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
    await page.getByLabel('Trim start', { exact: true }).press('Space');
    await expect(page.locator('video')).toHaveJSProperty('paused', false);
    await page.getByLabel('Seek playhead').press('Space');
    await expect(page.locator('video')).toHaveJSProperty('paused', true);
    await page.getByRole('button', { name: 'Fullscreen preview', exact: true }).click();
    await page.locator('.preview-panel').evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
    const root = (await page.locator('.editor-layout').boundingBox())!, preview = (await page.locator('.preview-panel').boundingBox())!;
    expect(preview.width).toBeCloseTo(root.width, 0); expect(preview.height).toBeCloseTo(root.height, 0);
    await expect(page.locator('.timeline')).toBeHidden(); await expect(page.locator('.app-header')).toBeVisible(); await expect(page.locator('.app-footer')).toBeVisible();
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(false);
    await page.keyboard.press('Escape');
    await expect(page.locator('.timeline')).toBeVisible(); await expect(page.getByRole('button', { name: 'Fullscreen preview', exact: true })).toBeFocused();
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});
