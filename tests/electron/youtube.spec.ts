import { test, expect, _electron } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Socket } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('uses bundled YouTube tools, shows video/audio choices, and cancels native extraction without leaving downloads', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-youtube-desktop-'));
  const existing = new Set(
    (await readdir(tmpdir())).filter((name) => name.startsWith('frame-download-')),
  );
  const connections: string[] = [],
    sockets = new Set<Socket>();
  // A stalled local proxy checks extraction/cancellation without reaching YouTube.
  const proxy = createServer();
  proxy.on('connect', (request, socket) => {
    if (request.url !== 'www.youtube.com:443') {
      socket.destroy();
      return;
    }
    socket.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).code !== 'ECONNRESET') throw error;
    });
    connections.push(request.url);
    sockets.add(socket as Socket);
    socket.on('close', () => sockets.delete(socket as Socket));
    socket.on('end', () => socket.end());
    socket.resume();
  });
  await new Promise<void>((accept) => proxy.listen(0, '127.0.0.1', accept));
  const proxyUrl = `http://127.0.0.1:${(proxy.address() as { port: number }).port}`;
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
    env: {
      ...process.env,
      FRAME_DEV_URL: '',
      PATH: '',
      HTTP_PROXY: proxyUrl,
      HTTPS_PROXY: proxyUrl,
      http_proxy: proxyUrl,
      https_proxy: proxyUrl,
    },
  });
  try {
    const paths = await app.evaluate(({ app }) => ({
      root: app.isPackaged ? process.resourcesPath : app.getAppPath(),
      packaged: app.isPackaged,
      runtime: process.execPath,
    }));
    const binary = join(
      paths.root,
      paths.packaged ? 'media-tools' : 'build/media-tools',
      process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp',
    );
    const tool = await promisify(execFile)(binary, ['--version'], {
      timeout: 15000,
      env: { ...process.env, PATH: '' },
    });
    const runtime = await promisify(execFile)(
      paths.runtime,
      ['--experimental-permission', '--no-warnings', '-p', 'process.versions.node'],
      { timeout: 10000, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PATH: '' } },
    );
    expect(tool.stdout.trim()).toBe('2026.08.19');
    expect(Number(runtime.stdout.trim().split('.')[0])).toBeGreaterThanOrEqual(22);
    const page = await app.firstWindow();
    await expect(
      page.evaluate(() =>
        window.frameDesktop!.importUrl('https://youtu.be/BaW_jenozKc', {
          media: { mode: 'audio', quality: '360' },
        } as never),
      ),
    ).rejects.toThrow('Invalid media import options');
    await page
      .locator('.empty-stage')
      .getByRole('button', { name: 'Load from URL', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Load from URL' });
    await page
      .getByLabel('Media URL', { exact: true })
      .fill('https://www.youtube.com/playlist?list=PL123');
    await page.getByRole('button', { name: 'Load media', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('individual YouTube video');
    await page
      .getByLabel('Media URL', { exact: true })
      .fill('https://youtu.be/BaW_jenozKc?list=PL123');
    await expect(page.getByLabel('YouTube import type')).toHaveValue('video');
    await expect(page.getByLabel('YouTube video quality')).toHaveValue('1080');
    await page.getByLabel('YouTube video quality').selectOption('best');
    await page.screenshot({ path: 'test-results/youtube-desktop-dialog.png' });
    await page.getByLabel('YouTube import type').selectOption('audio');
    await expect(page.getByLabel('YouTube video quality')).toHaveCount(0);
    await page.getByRole('button', { name: 'Load media', exact: true }).click();
    await expect.poll(() => connections.length).toBeGreaterThan(0);
    expect(connections[0]).toMatch(/^www\.youtube\.com:443$/);
    await expect(page.getByLabel('YouTube import type')).toBeDisabled();
    await dialog.getByRole('button', { name: 'Cancel download' }).click();
    await expect(dialog.getByRole('alert')).toContainText('cancelled');
    await expect(page.locator('.asset-list li')).toHaveCount(0);
    expect(
      (await readdir(tmpdir())).filter(
        (name) => name.startsWith('frame-download-') && !existing.has(name),
      ),
    ).toEqual([]);
    await expect.poll(() => sockets.size).toBe(0);
  } finally {
    await app.close();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((accept) => proxy.close(() => accept()));
    await rm(directory, { recursive: true, force: true });
  }
});
