import { test, expect, _electron } from '@playwright/test';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { verifyLibraryInsertion } from '../helpers/library-insertion';
import { probeConversion } from '../helpers/conversion-library';
test('edits a native library sequence with extracted audio and recovers generated sources after restart', async () => {
  test.setTimeout(120000);
  const directory = await mkdtemp(join(tmpdir(), 'frame-library-insertion-')), executablePath = process.env.FRAME_TEST_EXECUTABLE;
  const launch = () => _electron.launch({ executablePath: executablePath ? resolve(executablePath) : undefined,
    args: [`--user-data-dir=${join(directory, 'profile')}`, ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []), ...(executablePath ? [] : ['.'])],
    env: { ...process.env, PATH: '', FRAME_DEV_URL: '' } });
  let app = await launch();
  try {
    const page = await app.firstWindow(); await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => localStorage.setItem('frame:auto-waveforms', 'false')); await page.reload();
    await expect(page.getByLabel('Autosave status')).not.toHaveText(/Reopening|Clearing/);
    const paths = ['First.mp4', 'Second.mp4', 'Third.mp4'].map(name => join(directory, name));
    for (const path of paths) await copyFile(resolve('tests/fixtures/sample.mp4'), path);
    await app.evaluate(({ dialog }, paths) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths }); dialog.showSaveDialog = async () => { throw new Error('Preparation must not open a save dialog.'); }; }, paths);
    await page.getByRole('button', { name: 'Add media', exact: true }).click(); await verifyLibraryInsertion(page);
    await app.close(); app = await launch();
    const reopened = await app.firstWindow(); await reopened.emulateMedia({ reducedMotion: 'reduce' });
    await expect(reopened.locator('.asset-list li')).toHaveCount(6, { timeout: 60000 });
    await expect(reopened.locator('.timeline-clip')).toHaveCount(3); await expect(reopened.locator('.audio-layer-bar')).toHaveCount(1);
    await expect(reopened.locator('video')).toHaveJSProperty('readyState', 4);
    const output = join(directory, 'export.mp4'); await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, output);
    await reopened.getByRole('button', { name: 'Export MP4', exact: true }).click();
    await expect(reopened.getByRole('button', { name: 'Export MP4', exact: true })).toBeEnabled({ timeout: 60000 });
    expect(Number((await probeConversion(output)).format.duration)).toBeCloseTo(16, 1);
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});
