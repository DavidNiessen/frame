import { importTestMedia } from '../helpers/import-media';
import { closeEffect, openEffect } from '../helpers/effects';
import { expect, test, _electron } from '@playwright/test';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { trim } from '../helpers/timeline';
import { mediaServer } from '../helpers/media-server';
function launch(directory: string) {
  const executablePath = process.env.FRAME_TEST_EXECUTABLE;
  return _electron.launch({ executablePath: executablePath ? resolve(executablePath) : undefined, args: [`--user-data-dir=${join(directory, 'profile')}`, ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []), ...(executablePath ? [] : ['.'])], env: { ...process.env, PATH: '', FRAME_DEV_URL: '' } });
}
test('automatically reopens desktop media and recipes, then clears without resurrection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-auto-recovery-'));
  let app = await launch(directory);
  try {
    let page = await app.firstWindow(); await importTestMedia(page, app);
    await trim(page, 'start', 1); await trim(page, 'end', 2); await openEffect(page, 'Volume'); await page.getByLabel('Volume', { exact: true }).fill('0.5');
    await expect(page.getByLabel('Autosave status')).toHaveText('Workspace autosaved', { timeout: 30000 });
    await app.close(); app = await launch(directory); page = await app.firstWindow();
    await expect(page.getByLabel('Trim start', { exact: true })).toHaveAttribute('aria-valuenow', '1', { timeout: 30000 }); await expect(page.getByLabel('Trim end')).toHaveAttribute('aria-valuenow', '2'); await openEffect(page, 'Volume'); await expect(page.getByLabel('Volume', { exact: true })).toHaveValue('0.5');
    await expect(page.locator('video')).toHaveJSProperty('readyState', 4); await expect(page.getByRole('button', { name: 'Recover workspace' })).toHaveCount(0);
    await openEffect(page, 'Volume'); await page.getByLabel('Volume', { exact: true }).fill('0.3'); await page.getByRole('button', { name: 'Clear media library', exact: true }).click(); await expect(page.getByLabel('Autosave status')).toHaveText('Autosave ready');
    await app.close(); app = await launch(directory); page = await app.firstWindow(); await expect(page.getByLabel('Autosave status')).toHaveText('Autosave ready'); await expect(page.locator('video')).toHaveCount(0);
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});
test('retains a downloaded source through exit and can export it after automatic reopening', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-auto-download-')), server = await mediaServer();
  let app = await launch(directory);
  try {
    let page = await app.firstWindow(); await page.locator('.empty-stage').getByRole('button', { name: 'Load from URL', exact: true }).click();
    await page.getByLabel('Media URL', { exact: true }).fill(server.url + '/no-cors.wav'); await page.getByRole('button', { name: 'Load media', exact: true }).click();
    await expect(page.getByLabel('Autosave status')).toHaveText('Workspace autosaved', { timeout: 30000 });
    const path = join(directory, 'profile', 'workspace', 'workspace.json'), checkpoint = JSON.parse(await readFile(path, 'utf8'));
    const retainedPath = checkpoint.sources[0].path; expect(retainedPath).toContain(join('workspace', 'media')); expect(await readFile(retainedPath)).toEqual(server.wav);
    await app.close(); app = await launch(directory); page = await app.firstWindow(); await expect(page.locator('.asset-list li')).toHaveCount(1, { timeout: 30000 }); await expect(page.locator('audio').first()).toHaveJSProperty('readyState', 4);
    const destination = join(directory, 'reopened.flac'); await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); return true; }, destination);
    await closeEffect(page); await page.getByRole('tab', { name: 'Export', exact: true }).click(); await closeEffect(page); await page.getByLabel('Output format').selectOption('flac'); await closeEffect(page); await page.getByRole('button', { name: 'Export FLAC', exact: true }).click(); await expect(page.locator('.toast')).toContainText('Export complete');
    expect((await readFile(destination)).byteLength).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Clear media library', exact: true }).click(); await expect(page.getByLabel('Autosave status')).toHaveText('Autosave ready'); await expect(readFile(retainedPath)).rejects.toThrow(); expect((await readFile(destination)).byteLength).toBeGreaterThan(0);
  } finally { await app.close(); await server.close(); await rm(directory, { recursive: true, force: true }); }
});
test('reopens available originals when another source is missing and keeps its checkpoint', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-auto-partial-')), original = join(directory, 'original.mp4');
  await copyFile(resolve('tests/fixtures/sample.mp4'), original);
  let app = await launch(directory);
  try {
    let page = await app.firstWindow();
    await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); return true; }, original);
    await page.getByRole('button', { name: 'Add media', exact: true }).click(); await expect(page.locator('.asset-list li')).toHaveCount(1);
    await importTestMedia(page, app); await expect(page.locator('.asset-list li')).toHaveCount(2); await expect(page.getByLabel('Autosave status')).toHaveText('Workspace autosaved', { timeout: 30000 });
    await app.close(); await rm(original); app = await launch(directory); page = await app.firstWindow();
    await expect(page.locator('.asset-list li')).toHaveCount(1, { timeout: 30000 }); await expect(page.locator('.toast')).toContainText('moved or deleted'); await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
    // A settings visit and idle recovery must not replace the partially restored checkpoint.
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    expect(JSON.parse(await readFile(join(directory, 'profile', 'workspace', 'workspace.json'), 'utf8')).document.project.sources).toHaveLength(2);
    await page.getByRole('button', { name: 'Back to workspace', exact: true }).click(); await page.getByRole('button', { name: 'Clear media library', exact: true }).click(); await expect(page.getByLabel('Autosave status')).toHaveText('Autosave ready');
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});
