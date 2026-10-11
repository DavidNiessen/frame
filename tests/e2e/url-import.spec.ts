import { test, expect, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffprobe from '@ffprobe-installer/ffprobe';
import { mediaServer } from '../helpers/media-server';

async function load(page: Page, url: string) {
  const editorAction = page
    .locator('.empty-stage')
    .getByRole('button', { name: 'Load from URL', exact: true });
  await (
    (await editorAction.count())
      ? editorAction
      : page.getByRole('button', { name: 'Load from URL', exact: true })
  ).click();
  await page.getByLabel('Media URL', { exact: true }).fill(url);
  await page.getByRole('button', { name: 'Load media', exact: true }).click();
}
test('keeps editor URL imports reachable on desktop and mobile with a full library', async ({
  page,
}) => {
  const server = await mediaServer();
  try {
    await page.goto('/');
    for (const width of [1440, 850, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const action = page
        .locator('.empty-stage')
        .getByRole('button', { name: 'Load from URL', exact: true });
      await expect(action).toBeVisible();
      await action.click();
      await expect(page.getByRole('dialog', { name: 'Load from URL' })).toBeVisible();
      await page.getByRole('button', { name: 'Close URL import' }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await page.getByLabel('Choose media files').setInputFiles(
      Array.from({ length: 18 }, (_, index) => ({
        name: `Song ${index + 1}.wav`,
        mimeType: 'audio/wav',
        buffer: server.wav,
      })),
    );
    await expect(page.locator('.asset-list li')).toHaveCount(18, { timeout: 45000 });
    const action = page
      .locator('.library')
      .getByRole('button', { name: 'Load from URL', exact: true });
    await expect(action).toBeEnabled({ timeout: 45000 });
    for (const width of [1440, 850, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => scrollTo(0, 0));
      await expect(action).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await action.click();
      await expect(page.getByRole('dialog', { name: 'Load from URL' })).toBeVisible();
      await page.getByRole('button', { name: 'Close URL import' }).click();
    }
    await page.screenshot({ path: 'test-results/editor-url-library-mobile.png', fullPage: true });
  } finally {
    await server.close();
  }
});
test('loads direct media into editor and conversion, preserves filenames, and exports locally', async ({
  page,
}, testInfo) => {
  const server = await mediaServer();
  try {
    await page.goto('/');
    await load(page, server.url + '/download?token=example');
    await expect(page.getByRole('dialog', { name: 'Load from URL' })).not.toBeVisible({
      timeout: 45000,
    });
    await expect(page.locator('.asset-info strong')).toHaveText('A song ü.wav');
    await expect(page.locator('audio')).toHaveJSProperty('readyState', 4);
    await expect(page.getByRole('img', { name: 'Audio waveform', exact: true })).toBeVisible();
    await page.getByLabel('Output format').selectOption('flac');
    await page.getByRole('button', { name: 'Export FLAC', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Save file' })).toBeVisible({ timeout: 45000 });
    const pending = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Save file' }).click();
    const output = testInfo.outputPath('remote.flac');
    await (await pending).saveAs(output);
    const { stdout } = await promisify(execFile)(ffprobe.path, [
      '-v',
      'error',
      '-show_streams',
      '-of',
      'json',
      output,
    ]);
    expect(JSON.parse(stdout).streams[0].codec_name).toBe('flac');
    await page
      .getByRole('navigation', { name: 'Workflow' })
      .getByRole('button', { name: 'Convert', exact: true })
      .click();
    await load(page, server.url + '/redirect');
    await expect(page.getByRole('dialog', { name: 'Load from URL' })).not.toBeVisible();
    await expect(page.locator('.conversion-table tbody tr')).toHaveCount(2);
    await expect(page.locator('.conversion-table')).toContainText('video.mp4');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Load from URL', exact: true }).click();
    await expect(page.getByLabel('Media URL', { exact: true })).toBeFocused();
    await page.screenshot({ path: 'test-results/url-import-mobile.png', fullPage: true });
  } finally {
    await server.close();
  }
});
test('reports invalid links, CORS, pages, corrupt files and oversized downloads, and can cancel and retry', async ({
  page,
}) => {
  const server = await mediaServer();
  try {
    await page.goto('/');
    await load(page, 'file:///tmp/song.wav');
    const dialog = page.getByRole('dialog', { name: 'Load from URL' });
    await expect(dialog.getByRole('alert')).toContainText('HTTP and HTTPS');
    for (const [route, message] of [
      ['/missing.mp3', 'HTTP 404'],
      ['/page.mp4', 'direct video or audio'],
      ['/no-cors.wav', 'CORS'],
      ['/too-large.wav', 'exceeds'],
      ['/broken.wav', 'could not be read'],
    ] as const) {
      await page.getByLabel('Media URL', { exact: true }).fill(server.url + route);
      await dialog.getByRole('button', { name: 'Load media', exact: true }).click();
      await expect(dialog.getByRole('alert')).toContainText(message, { timeout: 45000 });
      await expect(page.locator('.asset-list li')).toHaveCount(0);
    }
    await page.getByLabel('Media URL', { exact: true }).fill(server.url + '/slow.wav');
    await dialog.getByRole('button', { name: 'Load media', exact: true }).click();
    await expect(page.locator('.app-footer .footer-activity')).toContainText('Downloading media');
    await expect(dialog.getByRole('status')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cancel download' }).click();
    await expect(dialog.getByRole('alert')).toContainText('cancelled');
    await expect.poll(() => server.slowClosed).toBe(true);
    await page.getByLabel('Media URL', { exact: true }).fill(server.url + '/video.mp4');
    await dialog.getByRole('button', { name: 'Load media', exact: true }).click();
    await expect(dialog).not.toBeVisible({ timeout: 45000 });
    await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
    await expect(page.locator('.asset-list li')).toHaveCount(1);
  } finally {
    await server.close();
  }
});
test('explains that YouTube import requires desktop without contacting YouTube', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  await load(page, 'https://youtu.be/BaW_jenozKc?t=4');
  await expect(
    page.getByRole('dialog', { name: 'Load from URL' }).getByRole('alert'),
  ).toContainText('Frame desktop app');
  await expect(page.getByLabel('YouTube import type')).toHaveCount(0);
  expect(requests.some((url) => /youtu(?:\.be|be\.com)/.test(url))).toBe(false);
});
