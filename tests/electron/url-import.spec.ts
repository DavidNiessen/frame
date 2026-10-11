import { test, expect, _electron } from '@playwright/test';
import { readdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffprobe from '@ffprobe-installer/ffprobe';
import { mediaServer } from '../helpers/media-server';

test('downloads raw URLs natively without CORS and cleans up on error, cancellation, removal and exit', async () => {
  const server = await mediaServer(),
    directory = await mkdtemp(join(tmpdir(), 'frame-url-desktop-'));
  const existing = new Set(
    (await readdir(tmpdir())).filter((name) => name.startsWith('frame-download-')),
  );
  const downloads = async () =>
    (await readdir(tmpdir())).filter(
      (name) => name.startsWith('frame-download-') && !existing.has(name),
    );
  const executablePath = process.env.FRAME_TEST_EXECUTABLE
    ? resolve(process.env.FRAME_TEST_EXECUTABLE)
    : undefined;
  const app = await _electron.launch({
    executablePath,
    args: [
      `--user-data-dir=${join(directory, 'profile')}`,
      ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []),
      ...(executablePath ? [] : ['.']),
    ],
    env: { ...process.env, FRAME_DEV_URL: '', PATH: '' },
  });
  try {
    const page = await app.firstWindow();
    await expect(
      page.evaluate(() => window.frameDesktop!.importUrl('file:///tmp/media.mp3')),
    ).rejects.toThrow('HTTP and HTTPS');
    await page
      .locator('.empty-stage')
      .getByRole('button', { name: 'Load from URL', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Load from URL' });
    for (const [route, message] of [
      ['/page.mp4', 'direct video or audio'],
      ['/broken.wav', 'could not be read'],
    ] as const) {
      await page.getByLabel('Media URL', { exact: true }).fill(server.url + route);
      await page.getByRole('button', { name: 'Load media', exact: true }).click();
      await expect(dialog.getByRole('alert')).toContainText(message);
      expect(await downloads()).toEqual([]);
    }
    await page.getByLabel('Media URL', { exact: true }).fill(server.url + '/slow.wav');
    await page.getByRole('button', { name: 'Load media', exact: true }).click();
    await expect(page.locator('.app-footer .footer-activity')).toContainText('Downloading media');
    await expect(dialog.getByRole('status')).toHaveCount(0);
    const nativeControls = await page.evaluate(() => !!window.frameDesktop?.nativeWindowControls);
    if (!nativeControls) {
      await page.keyboard.press('Control+Shift+Space');
      const minimize = page.getByRole('button', { name: 'Minimize window', exact: true });
      await expect(minimize).toBeVisible();
      await expect
        .poll(() =>
          minimize.evaluate((button) => {
            const bounds = button.getBoundingClientRect();
            return (
              document.elementFromPoint(
                bounds.x + bounds.width / 2,
                bounds.y + bounds.height / 2,
              ) === button ||
              button.contains(
                document.elementFromPoint(
                  bounds.x + bounds.width / 2,
                  bounds.y + bounds.height / 2,
                ),
              )
            );
          }),
        )
        .toBe(true);
    }
    await page
      .locator('.app-footer')
      .getByRole('button', { name: /Cancel/ })
      .click();
    await expect(dialog.getByRole('alert')).toContainText('cancelled');
    expect(await downloads()).toEqual([]);
    await page.getByLabel('Media URL', { exact: true }).fill(server.url + '/no-cors.wav');
    await page.getByRole('button', { name: 'Load media', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('audio')).toHaveJSProperty('readyState', 4);
    await expect(page.getByRole('img', { name: 'Audio waveform', exact: true })).toBeVisible();
    const stored = await downloads();
    expect(stored).toHaveLength(1);
    const files = await readdir(join(tmpdir(), stored[0]));
    expect(files).toEqual(['no-cors.wav']);
    expect(await readFile(join(tmpdir(), stored[0], files[0]))).toEqual(server.wav);
    const output = join(directory, 'downloaded.flac');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, output);
    await page.getByLabel('Output format').selectOption('flac');
    await page.getByRole('button', { name: 'Export FLAC', exact: true }).click();
    await expect(page.locator('.toast')).toContainText('Export complete');
    const { stdout } = await promisify(execFile)(ffprobe.path, [
      '-v',
      'error',
      '-show_streams',
      '-of',
      'json',
      output,
    ]);
    expect(JSON.parse(stdout).streams[0].codec_name).toBe('flac');
    await page.getByRole('button', { name: 'Remove no-cors.wav', exact: true }).click();
    await expect(page.locator('.asset-list li')).toHaveCount(0);
    expect(await downloads()).toEqual([]);
    await page
      .getByRole('navigation', { name: 'Workflow' })
      .getByRole('button', { name: 'Convert', exact: true })
      .click();
    await page.getByRole('button', { name: 'Load from URL', exact: true }).click();
    await page.getByLabel('Media URL', { exact: true }).fill(server.url + '/download');
    await page.getByRole('button', { name: 'Load media', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('.conversion-table tbody tr')).toHaveCount(1);
    await expect(page.locator('.conversion-table')).toContainText('A song ü.wav');
    expect(await downloads()).toHaveLength(1);
    await page.getByRole('button', { name: 'Load from URL', exact: true }).click();
    await page.getByLabel('Media URL', { exact: true }).fill(server.url + '/redirect');
    await page.getByRole('button', { name: 'Load media', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('.conversion-table tbody tr')).toHaveCount(2);
    await expect(page.locator('.conversion-table tbody tr').last()).toContainText(
      /(?:video|redirect)\.mp4/,
    );
    expect(await downloads()).toHaveLength(2);
  } finally {
    await app.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
  expect(await downloads()).toEqual([]);
});
