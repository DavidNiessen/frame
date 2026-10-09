import { expect, test, _electron } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { conversionLibrary } from '../helpers/conversion-library';

const exec = promisify(execFile);
test('cold-starts a development checkout from an absolute path without Vite or the project working directory', async () => {
  test.skip(!!process.env.FRAME_TEST_EXECUTABLE, 'Development checkout launch only.');
  const library = await conversionLibrary();
  const app = await _electron.launch({ cwd: library.directory, args: [`--user-data-dir=${join(library.directory, 'profile')}`, ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []), resolve('.'), '--frame-workflow=convert', '--', ...library.sources], env: { ...process.env, FRAME_DEV_URL: '', PATH: '' } });
  try {
    const page = await app.firstWindow();
    await expect(page.locator('.conversion-table tbody tr')).toHaveCount(2);
    await expect(page.getByRole('main', { name: 'Quick conversion' })).toBeVisible();
    expect(await page.evaluate(() => window.frameDesktop!.shellIntegrationStatus().then(status => status.detail))).toContain('These actions open this development checkout.');
    expect(await page.evaluate(() => window.frameDesktop!.shellIntegrationStatus().then(status => status.available))).toBe(true);
  } finally { await app.close(); await rm(library.directory, { recursive: true, force: true }); }
});
test('groups and queues mini selections while editor launches retain their drafts', async () => {
  const library = await conversionLibrary(), profile = join(library.directory, 'profile');
  const executablePath = process.env.FRAME_TEST_EXECUTABLE ? resolve(process.env.FRAME_TEST_EXECUTABLE) : undefined;
  const base = [`--user-data-dir=${profile}`, ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []), ...(executablePath ? [] : ['.'])];
  const app = await _electron.launch({ executablePath, args: [...base, '--frame-workflow=convert', '--', ...library.sources, join(library.root, 'broken.wav'), join(library.root, 'booklet.txt')], env: { ...process.env, PATH: '', FRAME_DEV_URL: '' } });
  const command = await app.evaluate(() => process.execPath);
  const launch = (mode: string, paths: string[]) => exec(command, [...base, `--frame-workflow=${mode}`, '--', ...paths], { env: { ...process.env, PATH: '', FRAME_DEV_URL: '' }, timeout: 15000 });
  try {
    const mini = await app.firstWindow();
    await expect(mini.locator('.conversion-table tbody tr')).toHaveCount(2);
    await expect(mini.locator('.mini-import-errors')).toContainText('could not be read');
    await expect(mini.locator('audio, video, .timeline-track')).toHaveCount(0);
    const created = app.waitForEvent('window');
    await launch('edit', [library.sources[0]]);
    const editor = await created;
    await expect(editor.getByLabel('Trim start', { exact: true })).toBeEnabled();
    await expect(editor.getByRole('img', { name: 'Audio waveform', exact: true })).toBeVisible();
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(2);
    await editor.getByLabel('Trim start', { exact: true }).press('ArrowRight');
    const draft = await editor.getByLabel('Trim start', { exact: true }).getAttribute('aria-valuenow');
    const editorWindow = await app.browserWindow(editor); await editorWindow.evaluate(window => window.minimize());
    await launch('edit', [library.sources[0]]);
    await expect.poll(() => editorWindow.evaluate(window => window.isMinimized())).toBe(false);
    await expect(editor.getByLabel('Trim start', { exact: true })).toHaveAttribute('aria-valuenow', draft!);
    await mini.getByLabel('Conversion format').selectOption('flac');
    await app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = () => new Promise(resolve => { (globalThis as typeof globalThis & { finishPicker: () => void }).finishPicker = () => resolve({ canceled: true, filePaths: [] }); });
    });
    await mini.getByRole('button', { name: 'Convert 2 files', exact: true }).click();
    await expect(mini.getByRole('button', { name: 'Cancel conversion' })).toBeVisible();
    const video = join(library.directory, 'Selected $video.mp4'); await copyFile('public/sample.mp4', video);
    await launch('convert', [video]);
    await expect.poll(() => mini.evaluate(() => window.frameDesktop!.nextLaunch().then(request => request?.count))).toBe(1);
    await launch('edit', [video]);
    await expect(editor.locator('video')).toHaveJSProperty('readyState', 4);
    await expect(mini.locator('.conversion-table tbody tr')).toHaveCount(2);
    await app.evaluate(() => (globalThis as typeof globalThis & { finishPicker: () => void }).finishPicker());
    await expect(mini.locator('.conversion-table tbody tr')).toHaveCount(3);
    await expect.poll(() => mini.evaluate(() => window.frameDesktop!.nextLaunch())).toBeNull();
    await launch('edit', [library.sources[0]]);
    await expect(editor.getByLabel('Trim start', { exact: true })).toHaveAttribute('aria-valuenow', draft!);
    expect(await mini.evaluate(async () => { try { await window.frameDesktop!.importLaunch('forged-id'); return false; } catch { return true; } })).toBe(true);
  } finally { await app.close(); await rm(library.directory, { recursive: true, force: true }); }
});

test('receives native open-file events before and after the renderer is ready', async () => {
  const library = await conversionLibrary(), executablePath = process.env.FRAME_TEST_EXECUTABLE ? resolve(process.env.FRAME_TEST_EXECUTABLE) : undefined;
  const app = await _electron.launch({ executablePath, args: [`--user-data-dir=${join(library.directory, 'profile')}`, ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []), ...(executablePath ? [] : ['.'])], env: { ...process.env, PATH: '', FRAME_DEV_URL: '' } });
  try {
    await app.evaluate(({ app }, paths) => { for (const path of paths) app.emit('open-file', { preventDefault() {} }, path); }, library.sources);
    const page = await app.firstWindow();
    await expect(page.getByRole('img', { name: 'Audio waveform', exact: true })).toBeVisible();
    await page.getByRole('navigation', { name: 'Workflow' }).getByRole('button', { name: 'Convert', exact: true }).click();
    await expect(page.locator('.conversion-table tbody tr')).toHaveCount(2);
  } finally { await app.close(); await rm(library.directory, { recursive: true, force: true }); }
});

test('invokes installed Windows classic and primary commands on a mixed multi-file selection', async () => {
  test.setTimeout(120000);
  test.skip(process.platform !== 'win32' || process.env.FRAME_TEST_SHELL_ACTIONS !== '1', 'Runs against the installed NSIS artifact on Windows CI.');
  const library = await conversionLibrary();
  await copyFile(library.sources[0], join(library.directory, 'Selection song & Björk %10.wav'));
  await copyFile('public/sample.mp4', join(library.directory, 'Selection video.mp4'));
  // Explorer launches use the normal app profile, so the primary must use it too.
  const app = await _electron.launch({ executablePath: resolve(process.env.FRAME_TEST_EXECUTABLE!), args: [], env: { ...process.env, PATH: '', FRAME_DEV_URL: '' } });
  try {
    const page = await app.firstWindow(), workflow = page.getByRole('navigation', { name: 'Workflow' });
    const powershell = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const invoke = (mode: string, primary = false) => exec(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resolve(`tests/helpers/invoke-windows-${primary ? 'primary' : 'action'}.ps1`), '-Directory', library.directory, '-Workflow', mode], { timeout: 30000 });
    for (const primary of [false, ...(process.env.FRAME_TEST_PRIMARY_MENU === '1' ? [true] : [])]) {
      await invoke('Convert', primary);
      await expect.poll(() => app.windows().length).toBe(2);
      const mini = app.windows().find(window => window !== page)!;
      await expect(mini.getByRole('main', { name: 'Quick conversion' })).toBeVisible();
      await expect(mini.locator('.conversion-table tbody tr')).toHaveCount(2);
      await mini.locator('.mini-files > summary').click();
      await expect(mini.getByText('Selection song & Björk %10.wav', { exact: true })).toBeVisible();
      await invoke('Edit', primary);
      await expect(workflow.getByRole('button', { name: 'Editor', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 });
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(2);
      const dismissed = mini.waitForEvent('close');
      await mini.getByRole('button', { name: 'Dismiss', exact: true }).click().catch(error => { if (!mini.isClosed()) throw error; });
      await dismissed;
      await workflow.getByRole('button', { name: 'Convert', exact: true }).click();
      await expect(page.locator('.conversion-table tbody tr')).toHaveCount(2);
      await workflow.getByRole('button', { name: 'Editor', exact: true }).click();
    }
  } finally { await app.close(); await rm(library.directory, { recursive: true, force: true }); }
});
