import { importTestMedia } from '../helpers/import-media';
import { test, expect, _electron } from '@playwright/test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { conversionLibrary, probeConversion } from '../helpers/conversion-library';
import { ffmpegPath } from '../../electron/native';
const exec = promisify(execFile);
test.use({ trace: 'retain-on-failure' });
function options(directory: string, files?: string[]) {
  const executablePath = process.env.FRAME_TEST_EXECUTABLE
    ? resolve(process.env.FRAME_TEST_EXECUTABLE)
    : undefined;
  return {
    executablePath,
    args: [
      `--user-data-dir=${join(directory, 'profile')}`,
      ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []),
      ...(executablePath ? [] : [resolve('.')]),
      ...(files ? ['--frame-workflow=convert', '--', ...files] : []),
    ],
    env: { ...process.env, FRAME_DEV_URL: '', PATH: '' },
  };
}

test('opens only a frameless corner converter with all settings and retains failed batches', async () => {
  const library = await conversionLibrary(),
    output = join(library.directory, 'Output');
  await mkdir(output);
  const original = await readFile(library.sources[1]);
  const app = await _electron.launch(options(library.directory, library.sources));
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('main', { name: 'Quick conversion' })).toBeVisible();
    await expect(page.locator('.desktop-chrome')).toHaveCount(0);
    expect(
      await page.evaluate(async () => {
        try {
          await globalThis.window.frameDesktop!.windowAction('close');
          return false;
        } catch {
          return true;
        }
      }),
    ).toBe(true);
    await expect(page.getByLabel('Conversion format')).toBeEnabled();
    await expect
      .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length))
      .toBe(1);
    if (process.platform === 'darwin') {
      // Dock/Finder activation while the mini window exists must not create an editor.
      await app.evaluate(({ app }) => app.emit('activate'));
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(
        1,
      );
    }
    const window = await app.evaluate(({ BrowserWindow, screen }) => {
      const w = BrowserWindow.getAllWindows()[0];
      return {
        bounds: w.getBounds(),
        work: screen.getDisplayMatching(w.getBounds()).workArea,
        resizable: w.isResizable(),
        minimizable: w.isMinimizable(),
        maximizable: w.isMaximizable(),
        top: w.isAlwaysOnTop(),
      };
    });
    expect(window.resizable).toBe(false);
    expect(window.top).toBe(true);
    // Electron documents these window-manager properties as unsupported on Linux.
    if (process.platform !== 'linux') {
      expect(window.minimizable).toBe(false);
      expect(window.maximizable).toBe(false);
    }
    expect(window.bounds.x + window.bounds.width).toBeLessThanOrEqual(
      window.work.x + window.work.width,
    );
    expect(window.bounds.y + window.bounds.height).toBeLessThanOrEqual(
      window.work.y + window.work.height,
    );
    await page.getByLabel('Conversion format').selectOption('mp3');
    await page.getByText('Advanced options', { exact: true }).click();
    await expect(page.getByLabel('Conversion include artwork')).toBeChecked();
    await expect(page.getByLabel('Conversion keep metadata')).toBeChecked();
    await page.getByLabel('Conversion audio bitrate').selectOption('256');
    await page.getByLabel('Conversion format').selectOption('flac');
    await app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
    });
    await page.getByRole('button', { name: 'Convert 2 files', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Retry unfinished files' })).toBeEnabled();
    await expect(page.locator('.mini-converter.expanded')).toBeVisible();
    await rm(library.sources[1]);
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, output);
    await page.getByRole('button', { name: 'Retry unfinished files' }).click();
    await expect(page.getByText('Some files need attention', { exact: true })).toBeVisible();
    expect(page.isClosed()).toBe(false);
    await writeFile(library.sources[1], original);
    const closed = app.waitForEvent('close');
    await page.getByRole('button', { name: 'Retry unfinished files' }).click();
    await closed;
    const first = join(output, 'Song.flac'),
      second = join(output, 'Song-1.flac');
    for (const path of [first, second])
      expect((await probeConversion(path)).streams[0].codec_name).toBe('flac');
    expect((await readFile(library.sources[1])).equals(original)).toBe(true);
  } finally {
    await app.close().catch(() => {});
    await rm(library.directory, { recursive: true, force: true });
  }
});

test('collapses real conversion to progress, expands and cancels without closing or leaving temporary files', async () => {
  const library = await conversionLibrary(),
    input = join(library.directory, 'Video.mp4'),
    output = join(library.directory, 'Output');
  await mkdir(output);
  await exec(ffmpegPath(), [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=1280x720:r=30:d=12',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-threads',
    '2',
    input,
  ]);
  const app = await _electron.launch(options(library.directory, [input]));
  try {
    const page = await app.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.getByRole('button', { name: 'Convert 1 file', exact: true })).toBeEnabled();
    // VP9 encoding stays active long enough to exercise expansion and cancellation on fast runners.
    await page.getByLabel('Conversion format').selectOption('webm');
    await page.getByRole('button', { name: 'High', exact: true }).click();
    // Import completion means the window has been shown; firstWindow can arrive
    // before Cocoa settles its initial frame geometry.
    const initialBounds = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getBounds(),
    );
    const initialHeight = initialBounds.height;

    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, output);
    await page.getByRole('button', { name: 'Convert 1 file', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Expand conversion' })).toBeVisible();
    await expect(page.locator('.mini-progress .loading-beam')).toHaveAttribute(
      'data-active',
      'true',
    );
    await expect(page.locator('progress, [role=progressbar]')).toHaveCount(0);
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds().height),
      )
      .toBe(78);
    await page.screenshot({ path: 'test-results/desktop/mini-collapsed.png' });
    await page.getByRole('button', { name: 'Expand conversion' }).click();
    // macOS can round native window bounds by two pixels when restoring them.
    await expect
      .poll(async () =>
        Math.abs(
          (await app.evaluate(
            ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds().height,
          )) - initialHeight,
        ),
      )
      .toBeLessThanOrEqual(2)
      .catch(async (error) => {
        const restored = await app.evaluate(({ BrowserWindow, screen }) => {
          const bounds = BrowserWindow.getAllWindows()[0].getBounds();
          return { bounds, workArea: screen.getDisplayMatching(bounds).workArea };
        });
        await test.info().attach('mini-window-geometry', {
          body: JSON.stringify({ initialBounds, restored }, null, 2),
          contentType: 'application/json',
        });
        throw error;
      });
    await expect(page.locator('.mini-footer .footer-activity')).toContainText('Converting files');
    await expect(page.locator('.mini-footer .footer-task-percent')).toHaveText(/\d+%/);
    await expect(
      page.locator('.mini-footer').getByRole('button', { name: 'Add files' }),
    ).toBeHidden();
    await expect(
      page.locator('.mini-footer').getByRole('button', { name: 'Add folder' }),
    ).toBeHidden();
    const footer = (await page.locator('.mini-footer').boundingBox())!,
      activity = (await page.locator('.mini-footer .footer-activity').boundingBox())!;
    expect(Math.abs(activity.x + activity.width / 2 - footer.x - footer.width / 2)).toBeLessThan(
      1.5,
    );
    await expect(
      page.locator('.mini-footer').getByRole('button', { name: 'Cancel conversion' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Cancel conversion' }).click();
    await expect(page.getByRole('button', { name: 'Retry unfinished files' })).toBeEnabled();
    await expect(page.locator('.mini-converter.expanded')).toBeVisible();
    expect(page.isClosed()).toBe(false);
    await expect(
      (await import('node:fs/promises'))
        .readdir(output)
        .then((files) => files.some((name) => name.startsWith('.frame-'))),
    ).resolves.toBe(false);
  } finally {
    await app.close().catch(() => {});
    await rm(library.directory, { recursive: true, force: true });
  }
});

test('starts a fresh context selection after a partial failure, including previously completed files', async () => {
  const library = await conversionLibrary(),
    output = join(library.directory, 'Output');
  await mkdir(output);
  const launchOptions = options(library.directory, library.sources);
  const app = await _electron.launch(launchOptions);
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('button', { name: 'Convert 2 files', exact: true })).toBeEnabled();
    await page.getByLabel('Conversion format').selectOption('flac');
    await rm(library.sources[1]);
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, output);
    await page.getByRole('button', { name: 'Convert 2 files', exact: true }).click();
    await expect(page.getByText('Some files need attention', { exact: true })).toBeVisible();
    const command = await app.evaluate(() => process.execPath);
    await exec(
      command,
      [...options(library.directory).args, '--frame-workflow=convert', '--', library.sources[0]],
      { env: launchOptions.env, timeout: 15000 },
    );
    await expect(page.getByRole('button', { name: 'Convert 1 file', exact: true })).toBeEnabled();
    await expect(page.getByText('Some files need attention', { exact: true })).toHaveCount(0);
    const closed = app.waitForEvent('close');
    await page.getByRole('button', { name: 'Convert 1 file', exact: true }).click();
    await closed;
    for (const name of ['Song.flac', 'Song-1.flac'])
      expect((await probeConversion(join(output, name))).streams[0].codec_name).toBe('flac');
  } finally {
    await app.close().catch(() => {});
    await rm(library.directory, { recursive: true, force: true });
  }
});

test('keeps an open editor intact and isolates its assets from the mini conversion', async () => {
  const library = await conversionLibrary(),
    output = join(library.directory, 'Output');
  await mkdir(output);
  const launchOptions = options(library.directory),
    app = await _electron.launch(launchOptions);
  const child = app.process();
  try {
    const editor = await app.firstWindow();
    await importTestMedia(editor, app);
    await expect(editor.getByLabel('Trim start', { exact: true })).toBeEnabled();
    await editor.getByLabel('Trim start', { exact: true }).press('ArrowRight');
    const draft = await editor
      .getByLabel('Trim start', { exact: true })
      .getAttribute('aria-valuenow');
    const source = await editor.locator('video').getAttribute('src');
    const command = await app.evaluate(() => process.execPath);
    const created = app.waitForEvent('window', { timeout: 15000 });
    await exec(
      command,
      [...launchOptions.args, '--frame-workflow=convert', '--', ...library.sources],
      { env: launchOptions.env, timeout: 15000 },
    );
    const mini = await created;
    await expect(mini.getByLabel('Conversion format')).toBeEnabled();
    await expect(mini.locator('.conversion-table tbody tr')).toHaveCount(2);
    await expect(editor.getByLabel('Trim start', { exact: true })).toHaveAttribute(
      'aria-valuenow',
      draft!,
    );
    await expect(
      mini.evaluate(async (id) => {
        try {
          await window.frameDesktop!.waveform(id!);
          return false;
        } catch {
          return true;
        }
      }, source?.split('/').at(-1)),
    ).resolves.toBe(true);
    await mini.getByLabel('Conversion format').selectOption('flac');
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, output);
    const closed = mini.waitForEvent('close', { timeout: 15000 });
    await mini.getByRole('button', { name: 'Convert 2 files', exact: true }).click();
    await closed;
    await expect
      .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length))
      .toBe(1);
    await expect(editor.getByLabel('Trim start', { exact: true })).toHaveAttribute(
      'aria-valuenow',
      draft!,
    );
    await expect(editor.locator('video')).toHaveAttribute('src', source!);
    // Reopening creates a new isolated session, without stale IPC handlers or media.
    const reopened = app.waitForEvent('window', { timeout: 15000 });
    await exec(
      command,
      [...launchOptions.args, '--frame-workflow=convert', '--', library.sources[0]],
      { env: launchOptions.env, timeout: 15000 },
    );
    const next = await reopened;
    await expect(next.getByRole('button', { name: 'Convert 1 file', exact: true })).toBeEnabled();
    const dismissed = next.waitForEvent('close', { timeout: 15000 });
    // Electron may destroy the renderer before Playwright receives the click reply.
    await next
      .getByRole('button', { name: 'Close conversion', exact: true })
      .click()
      .catch((error) => {
        if (!next.isClosed()) throw error;
      });
    await dismissed;
    expect(editor.isClosed()).toBe(false);
  } finally {
    try {
      if (child.exitCode === null) {
        // Let the inspector acknowledge the request before Frame exits. Playwright's
        // synchronous app.close() can deadlock when the reopened mini window closed.
        await app.evaluate(({ app }) => {
          setTimeout(() => app.quit(), 50);
        });
        await expect.poll(() => child.exitCode, { timeout: 8000 }).toBe(0);
      }
    } finally {
      if (child.exitCode === null) child.kill();
      await rm(library.directory, { recursive: true, force: true });
    }
  }
});
