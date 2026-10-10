import { test, expect, _electron } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ffmpegPath } from '../../electron/native';
const exec = promisify(execFile);
test('keeps the desktop process alive when deleting playing local and downloaded sources', async ({}, info) => {
  test.setTimeout(120000);
  const directory = await mkdtemp(join(tmpdir(), 'frame-library-removal-')), source = join(directory, 'long.wav');
  await exec(ffmpegPath()!, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=180', source]);
  const content = await readFile(source);
  const server = createServer((request, response) => { response.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': content.length }); response.end(content); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const app = await _electron.launch({ args: ['.', `--user-data-dir=${join(directory, 'profile')}`, ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : [])], env: { ...process.env, FRAME_DEV_URL: '' } });
  let output = ''; app.process().stderr?.on('data', chunk => { output += chunk; });
  try {
    const page = await app.firstWindow(); await expect(page.getByLabel('Autosave status')).toHaveText('Autosave ready');
    for (let cycle = 0; cycle < 4; cycle++) {
      await page.getByRole('button', { name: 'Start with a sample A short studio study', exact: true }).click();
      if (cycle % 2) {
        await page.getByRole('button', { name: 'Load from URL', exact: true }).click();
        await page.getByLabel('Media URL', { exact: true }).fill(`http://127.0.0.1:${address.port}/long.wav`);
        await page.getByRole('button', { name: 'Load media', exact: true }).click();
      } else await page.getByLabel('Choose media files').setInputFiles(source);
      await expect(page.locator('.asset-list li')).toHaveCount(2);
      await expect(page.locator('audio').first()).toHaveJSProperty('readyState', 4);
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await page.locator('.asset-list .asset.selected .asset-remove').click();
      await expect(page.locator('.asset-list li')).toHaveCount(1); await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
      await page.getByRole('button', { name: 'Play', exact: true }).click(); await page.locator('.asset-list .asset-remove').click();
      await expect(page.locator('.asset-list li')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Try a sample', exact: true })).toBeEnabled();
      expect(app.process().exitCode).toBeNull();
    }
    expect((await readFile(source)).equals(content)).toBe(true);
  } finally {
    await info.attach('desktop-stderr', { body: output, contentType: 'text/plain' });
    await app.close().catch(() => {}); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true });
  }
});
test('reports release failures without leaving a stale player or closing the app', async ({}, info) => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-release-failure-'));
  const app = await _electron.launch({ args: ['.', `--user-data-dir=${directory}`, ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : [])], env: { ...process.env, FRAME_DEV_URL: '' } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByLabel('Autosave status')).toHaveText('Autosave ready');
    await page.getByRole('button', { name: 'Try a sample', exact: true }).click();
    await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('media:release');
      ipcMain.handle('media:release', () => { throw new Error('Simulated file cleanup failure'); });
    });
    await page.locator('.asset-list .asset-remove').click();
    await expect(page.locator('video')).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: 'Could not finish releasing' })).toContainText('Simulated file cleanup failure');
    await page.getByRole('button', { name: 'Try a sample', exact: true }).click();
    await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
    expect(app.process().exitCode).toBeNull();
    await page.screenshot({ path: info.outputPath('reimport-after-release-failure.png') });
  } finally { await app.close().catch(() => {}); await rm(directory, { recursive: true, force: true }); }
});
