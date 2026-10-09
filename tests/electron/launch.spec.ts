import { expect, test, _electron } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { conversionLibrary } from '../helpers/conversion-library';

const exec = promisify(execFile);
test('opens selections in one instance, reuses drafts, and queues file launches during processing', async () => {
  const library = await conversionLibrary(), profile = join(library.directory, 'profile');
  const executablePath = process.env.FRAME_TEST_EXECUTABLE ? resolve(process.env.FRAME_TEST_EXECUTABLE) : undefined;
  const base = [`--user-data-dir=${profile}`, ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []), ...(executablePath ? [] : ['.'])];
  const app = await _electron.launch({ executablePath, args: [...base, '--frame-workflow=convert', '--', ...library.sources, join(library.root, 'broken.wav'), join(library.root, 'booklet.txt')], env: { ...process.env, PATH: '', FRAME_DEV_URL: '' } });
  const command = await app.evaluate(() => process.execPath);
  const launch = (mode: string, paths: string[]) => exec(command, [...base, `--frame-workflow=${mode}`, '--', ...paths], { env: { ...process.env, PATH: '', FRAME_DEV_URL: '' }, timeout: 15000 });
  try {
    const page = await app.firstWindow(), workflow = page.getByRole('navigation', { name: 'Workflow' });
    await expect(workflow.getByRole('button', { name: 'Convert', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.conversion-table tbody tr')).toHaveCount(2);
    await expect(page.locator('.conversion-import-report')).toContainText('1 file could not be read');
    await expect(page.locator('audio, video, .timeline-track')).toHaveCount(0);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
    await launch('edit', [library.sources[0]]);
    await expect(workflow.getByRole('button', { name: 'Editor', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Trim start', { exact: true })).toBeEnabled();
    await expect(page.getByRole('img', { name: 'Audio waveform', exact: true })).toBeVisible();
    expect(await app.evaluate(({ BrowserWindow }) => ({ count: BrowserWindow.getAllWindows().length, minimized: BrowserWindow.getAllWindows()[0].isMinimized() }))).toEqual({ count: 1, minimized: false });
    await page.getByLabel('Trim start', { exact: true }).press('ArrowRight');
    const draft = await page.getByLabel('Trim start', { exact: true }).getAttribute('aria-valuenow');
    await launch('convert', library.sources);
    await expect(workflow.getByRole('button', { name: 'Convert', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.conversion-table tbody tr')).toHaveCount(2);
    await page.getByLabel('Conversion format').selectOption('flac');
    await app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = () => new Promise(resolve => { (globalThis as typeof globalThis & { finishPicker: () => void }).finishPicker = () => resolve({ canceled: true, filePaths: [] }); });
    });
    await page.getByRole('button', { name: 'Convert 2 files', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Cancel conversion' })).toBeVisible();
    const video = join(library.directory, 'Selected $video.mp4'); await copyFile('public/sample.mp4', video);
    await launch('edit', [video]);
    await expect.poll(() => page.evaluate(() => window.frameDesktop!.nextLaunch().then(request => request?.count))).toBe(1);
    await expect(workflow.getByRole('button', { name: 'Convert', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.conversion-table tbody tr')).toHaveCount(2);
    await app.evaluate(() => (globalThis as typeof globalThis & { finishPicker: () => void }).finishPicker());
    await expect(workflow.getByRole('button', { name: 'Editor', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
    await launch('edit', [library.sources[0]]);
    await expect(page.getByLabel('Trim start', { exact: true })).toHaveAttribute('aria-valuenow', draft!);
    await expect.poll(() => page.evaluate(() => window.frameDesktop!.nextLaunch())).toBeNull();
    // A renderer cannot use the OS import channel to submit arbitrary filesystem paths.
    expect(await page.evaluate(async () => { try { await window.frameDesktop!.importLaunch('forged-id'); return false; } catch { return true; } })).toBe(true);
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
