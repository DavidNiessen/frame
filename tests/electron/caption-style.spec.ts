import { expect, test, _electron } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ffmpegPath } from '../../electron/native';
import { closeEffect, selectFont } from '../helpers/effects';
const exec = promisify(execFile);
test('lists installed fonts and preserves a styled desktop caption through save and native export', async () => {
  test.setTimeout(120000);
  const directory = await mkdtemp(join(tmpdir(), 'frame-native-caption-')), executablePath = process.env.FRAME_TEST_EXECUTABLE;
  const source = join(directory, 'black.mp4'); await exec(ffmpegPath()!, ['-y', '-f', 'lavfi', '-i', 'color=black:s=360x240:d=2', source]);
  const app = await _electron.launch({ executablePath: executablePath ? resolve(executablePath) : undefined, args: [`--user-data-dir=${join(directory, 'profile')}`, ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []), ...(executablePath ? [] : ['.'])], env: { ...process.env, PATH: '', FRAME_DEV_URL: '' } });
  try {
    const page = await app.firstWindow(); await page.evaluate(() => localStorage.setItem('frame:auto-waveforms', 'false')); await page.reload();
    const fonts = await page.evaluate(() => window.frameDesktop!.installedFonts());
    const font = fonts.includes('Open Sans') ? 'Open Sans' : fonts.find(name => !['DejaVu Sans', 'DejaVu Serif', 'DejaVu Sans Mono'].includes(name)); expect(font).toBeTruthy();
    await page.getByLabel('Choose media files').setInputFiles(source); await page.getByRole('button', { name: 'Add Captions', exact: true }).click(); await page.getByRole('button', { name: 'Caption 1', exact: true }).click();
    await page.getByLabel('Caption text', { exact: true }).fill('SYSTEM'); await selectFont(page, font!);
    await page.getByLabel('Caption text color').fill('#ff0000'); await page.getByLabel('Caption font size').fill('8'); await page.getByLabel('Caption background opacity').fill('0'); await page.getByLabel('Bold', { exact: true }).check(); await page.getByLabel('Italic', { exact: true }).check();
    await page.getByRole('button', { name: 'Play', exact: true }).click(); await expect(page.locator('.effect-settings-overlay')).toBeVisible(); await page.getByRole('button', { name: 'Pause', exact: true }).click(); await closeEffect(page);
    const project = join(directory, 'caption.frame.json'); await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, project); await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect.poll(() => readFile(project, 'utf8').then(text => JSON.parse(text).sources[0].edit.subtitles.cues[0].style.font)).toBe(`system:${font}`);
    const output = join(directory, 'caption.mp4'); await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, output);
    await page.getByRole('button', { name: 'Export MP4', exact: true }).click(); await expect(page.getByText('Export ready', { exact: true })).toBeVisible({ timeout: 45000 });
    const { stdout } = await exec(ffmpegPath()!, ['-v', 'error', '-i', output, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer', maxBuffer: 2_000_000 });
    let red = 0; for (let pixel = 0; pixel < stdout.length; pixel += 3) if (stdout[pixel] > 150 && stdout[pixel + 1] < 60 && stdout[pixel + 2] < 60) red++;
    expect(red).toBeGreaterThan(100);
    const assets = await page.evaluate(() => window.frameDesktop!.importFiles());
    const edit = JSON.parse(await readFile(project, 'utf8')).sources[0].edit;
    edit.subtitles.cues[0].style.font = 'system:Frame Test Missing Font';
    await expect(page.evaluate(({ asset, edit }) => window.frameDesktop!.previewFrame(asset.id, edit, 0), { asset: assets.assets[0], edit })).rejects.toThrow('not installed');
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});
