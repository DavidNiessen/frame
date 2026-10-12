import { expect, test, _electron } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Socket } from 'node:net';

test('routes social links to native extraction, shows music defaults and cancels each download', async ({}, info) => {
  test.setTimeout(120000);
  const directory = await mkdtemp(join(tmpdir(), 'frame-online-media-'));
  const sockets = new Set<Socket>(),
    connections: string[] = [];
  const proxy = createServer();
  proxy.on('connect', (request, socket) => {
    if (
      !/(?:^|\.)(?:instagram|tiktok|soundcloud|vimeo|dailymotion|bandcamp)\.com:443$/.test(
        request.url || '',
      )
    ) {
      socket.destroy();
      return;
    }
    connections.push(request.url || '');
    sockets.add(socket as Socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket as Socket));
    socket.on('end', () => socket.end());
    socket.resume();
  });
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const proxyUrl = `http://127.0.0.1:${(proxy.address() as { port: number }).port}`;
  const app = await _electron.launch({
    args: [
      '.',
      `--user-data-dir=${join(directory, 'profile')}`,
      ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []),
    ],
    env: {
      ...process.env,
      FRAME_DEV_URL: '',
      HTTP_PROXY: proxyUrl,
      HTTPS_PROXY: proxyUrl,
      http_proxy: proxyUrl,
      https_proxy: proxyUrl,
    },
  });
  try {
    const page = await app.firstWindow();
    await page
      .locator('.empty-stage')
      .getByRole('button', { name: 'Load from URL', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Load from URL' });
    for (const [url, name, host, music] of [
      ['https://instagram.com/reel/abc/', 'Instagram', /instagram\.com:443$/, false],
      ['https://tiktok.com/@artist/video/123456789', 'TikTok', /tiktok\.com:443$/, false],
      ['https://soundcloud.com/artist/song', 'SoundCloud', /soundcloud\.com:443$/, true],
      ['https://vimeo.com/12345', 'Vimeo', /vimeo\.com:443$/, false],
      ['https://dailymotion.com/video/x123abc', 'Dailymotion', /dailymotion\.com:443$/, false],
      ['https://artist.bandcamp.com/track/song', 'Bandcamp', /bandcamp\.com:443$/, true],
    ] as const) {
      connections.length = 0;
      await dialog.getByLabel('Media URL', { exact: true }).fill(url);
      await expect(dialog.locator('.online-media-source')).toContainText(name);
      if (music) {
        await expect(dialog.locator('.online-media-source')).toContainText('Audio only');
        await expect(dialog.locator('select')).toHaveCount(0);
      } else {
        await expect(dialog.getByLabel(name + ' import type')).toHaveValue('video');
        await dialog.getByLabel(name + ' video quality').selectOption('best');
      }
      if (name === 'SoundCloud')
        await page.screenshot({ path: info.outputPath('soundcloud-import.png') });
      await dialog.getByRole('button', { name: 'Load media', exact: true }).click();
      await expect.poll(() => connections.some((connection) => host.test(connection))).toBe(true);
      await expect(page.locator('.footer-activity')).toContainText('Reading ' + name);
      await dialog.getByRole('button', { name: 'Cancel download' }).click();
      await expect(dialog.getByRole('alert')).toContainText('cancelled');
      await expect
        .poll(() => sockets.size, {
          message: `${name} connections should close: ${connections.join(', ')}`,
        })
        .toBe(0);
      await expect(page.locator('.asset-list li')).toHaveCount(0);
    }
    await page.getByLabel('Media URL', { exact: true }).fill('https://instagram.com/artist/');
    await dialog.getByRole('button', { name: 'Load media', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('individual Instagram');
  } finally {
    await app.close();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
