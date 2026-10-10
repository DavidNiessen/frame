import { expect, test, _electron } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
test('uses native command search to save a real project and navigate export controls', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-command-test-')), executablePath = process.env.FRAME_TEST_EXECUTABLE;
  const app = await _electron.launch({ executablePath: executablePath ? resolve(executablePath) : undefined, args: [`--user-data-dir=${join(directory, 'profile')}`, ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []), ...(executablePath ? [] : ['.'])], env: { ...process.env, PATH: '', FRAME_DEV_URL: '' } });
  try {
    const page = await app.firstWindow(); await page.getByRole('button', { name: 'Try a sample', exact: true }).click(); await expect(page.getByRole('button', { name: 'Save project', exact: true })).toBeEnabled();
    const path = join(directory, 'command.frame.json'); await app.evaluate(({ dialog }, destination) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination }); }, path);
    await page.keyboard.press('Control+k'); const search = page.getByRole('combobox', { name: 'Search commands', exact: true }); await expect(search).toBeFocused(); await search.fill('save project'); await search.press('Enter');
    await expect.poll(async () => readFile(path, 'utf8').then(text => JSON.parse(text).sources.length).catch(() => 0)).toBe(1);
    await page.keyboard.press('Control+k'); await search.fill('export settings'); await search.press('Enter'); await expect(page.getByRole('tab', { name: 'Export', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: 'Fullscreen preview', exact: true }).click();
    await page.keyboard.press('Control+k'); await search.fill('export settings'); await search.press('Enter'); await expect(page.locator('.app-shell')).not.toHaveClass(/preview-expanded/);
    await page.getByRole('button', { name: 'Settings', exact: true }).click(); await page.getByRole('button', { name: 'Back to workspace', exact: true }).click(); await expect(page.getByRole('tab', { name: 'Export', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Control+k'); await search.fill('settings'); await search.press('Enter'); await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});
