import { test, expect, _electron } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { installerName } from '../../src/core/app-updates';

test('checks releases, cancels and verifies downloads, and shows verified downloads and update notifications', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-update-ui-'));
  await mkdir(join(directory, 'profile'));
  await writeFile(
    join(directory, 'profile', 'update-preferences.json'),
    JSON.stringify({ automatic: false, includePrereleases: false }),
  );
  const executablePath = process.env.FRAME_TEST_EXECUTABLE
    ? resolve(process.env.FRAME_TEST_EXECUTABLE)
    : undefined;
  const application = await _electron.launch({
    executablePath,
    args: [
      `--user-data-dir=${join(directory, 'profile')}`,
      ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []),
      ...(executablePath ? [] : ['.']),
    ],
    env: { ...process.env, FRAME_DEV_URL: '' },
  });
  try {
    const info = await application.evaluate(({ app }) => ({
      platform: process.platform,
      arch: process.arch,
      major: Number(app.getVersion().split('.')[0]),
    }));
    const version = `${info.major + 1}.0.0`,
      tag = `v${version}`;
    const name = installerName(version, info.platform, info.arch)!;
    const bytes = Buffer.alloc(4096, 42),
      checksum = createHash('sha256').update(bytes).digest('hex');
    await application.evaluate(
      ({ net, shell }, fixture) => {
        const state = globalThis as typeof globalThis & {
          updateRequests: string[];
          openedUpdate: string;
        };
        state.updateRequests = [];
        state.openedUpdate = '';
        net.fetch = async (url, options) => {
          const path = String(url);
          state.updateRequests.push(path);
          if (path.includes('/releases/latest'))
            return new Response(
              JSON.stringify({
                tag_name: fixture.tag,
                prerelease: false,
                draft: false,
                assets: [fixture.name, 'SHA256SUMS.txt'].map((name) => ({
                  name,
                  size: 4096,
                  browser_download_url: `https://github.com/DavidNiessen/frame/releases/download/${fixture.tag}/${name}`,
                })),
              }),
            );
          if (path.includes('/releases?')) {
            const tag = `${fixture.tag}-build.42`;
            return new Response(
              JSON.stringify([
                {
                  tag_name: tag,
                  prerelease: true,
                  assets: [fixture.name, 'SHA256SUMS.txt'].map((name) => ({
                    name,
                    size: 4096,
                    browser_download_url: `https://github.com/DavidNiessen/frame/releases/download/${tag}/${name}`,
                  })),
                },
              ]),
            );
          }
          if (path.endsWith('SHA256SUMS.txt'))
            return new Response(`${fixture.checksum}  ${fixture.name}`);
          return new Response(
            new ReadableStream({
              start(stream) {
                stream.enqueue(new Uint8Array(2048).fill(42));
                const timer = setTimeout(() => {
                  stream.enqueue(new Uint8Array(2048).fill(42));
                  stream.close();
                }, 1500);
                options?.signal?.addEventListener(
                  'abort',
                  () => {
                    clearTimeout(timer);
                    stream.error(new Error('cancelled'));
                  },
                  { once: true },
                );
              },
            }),
          );
        };
        shell.openPath = async (path) => {
          state.openedUpdate = path;
          return '';
        };
        shell.showItemInFolder = (path) => {
          state.openedUpdate = path;
        };
      },
      { tag, name, checksum },
    );
    const page = await application.firstWindow();
    if (process.env.FRAME_TEST_RELEASE_TAG)
      expect((await page.evaluate(() => window.frameDesktop!.updateStatus())).current).toBe(
        process.env.FRAME_TEST_RELEASE_TAG,
      );
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const updates = page.locator('section[aria-labelledby="updates-heading"]');
    await updates.getByRole('button', { name: 'Check for updates', exact: true }).click();
    await expect(updates).toContainText(`Frame ${version} is available`);
    await expect(page.locator('#settings-update-notice')).toBeVisible();
    await expect(updates).toHaveAttribute('data-update-available', 'true');
    await expect(page.locator('.settings-page > .settings-card').first()).toHaveAttribute(
      'aria-labelledby',
      'updates-heading',
    );
    expect(
      await application.evaluate(
        () =>
          (globalThis as typeof globalThis & { updateRequests: string[] }).updateRequests.length,
      ),
    ).toBe(1);
    await updates.getByRole('button', { name: 'Install update' }).click();
    await expect(updates.getByRole('button', { name: 'Cancel download' })).toBeVisible();
    await updates.getByRole('button', { name: 'Cancel download' }).click();
    await expect(updates.getByRole('button', { name: 'Install update' })).toBeEnabled();
    const downloadDirectory = join(directory, 'profile', 'updates', tag);
    expect(await readdir(downloadDirectory)).toEqual([]);
    await updates.getByRole('button', { name: 'Install update' }).click();
    await page.getByRole('button', { name: 'Back to workspace' }).click();
    await expect(page.getByRole('contentinfo', { name: 'Workspace status' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    await expect(page.getByRole('contentinfo', { name: 'Workspace status' })).toContainText(
      'Downloading Frame update',
    );
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const openButton = 'Show download';
    await expect(updates.getByRole('button', { name: openButton })).toBeEnabled();
    const path = join(downloadDirectory, name);
    expect(await readFile(path)).toEqual(bytes);
    await updates.getByRole('button', { name: openButton }).click();
    await expect
      .poll(async () => {
        const opened = await application.evaluate(
          () => (globalThis as typeof globalThis & { openedUpdate: string }).openedUpdate,
        );
        return opened ? realpath(opened) : '';
      })
      .toBe(await realpath(path));
    await writeFile(path, 'tampered');
    await updates.getByRole('button', { name: openButton }).click();
    await expect(updates.getByRole('alert')).toContainText('checksum mismatch');
    await expect(updates.getByRole('button', { name: openButton })).toHaveCount(0);
    const automatic = page.getByLabel('Check for updates automatically');
    await automatic.check();
    await expect(automatic).toBeChecked();
    await expect(automatic).toBeEnabled();
    await automatic.uncheck();
    await expect(automatic).not.toBeChecked();
    await expect(automatic).toBeEnabled();
    const preferences = JSON.parse(
      await readFile(join(directory, 'profile', 'update-preferences.json'), 'utf8'),
    );
    expect(preferences).toEqual({ automatic: false, includePrereleases: false });
    await page.getByLabel('Include prereleases').check();
    await expect(page.locator('#settings-update-notice')).toHaveCount(0);
    await updates.getByRole('button', { name: 'Check for updates', exact: true }).click();
    await expect(updates).toContainText(`Frame ${version}-build.42 is available as a prerelease`);
    await expect(page.locator('#settings-update-notice')).toBeVisible();
    await expect(updates).toHaveAttribute('data-update-available', 'true');
    await expect(updates.locator('.update-install-button')).toBeEnabled();
    await page.screenshot({ path: 'test-results/desktop/update-notification.png' });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(updates.locator('.update-install-button svg')).toHaveCSS('animation-name', 'none');
    await page.getByLabel('Include prereleases').uncheck();
    await expect(page.locator('#settings-update-notice')).toHaveCount(0);
  } finally {
    await application.close();
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
