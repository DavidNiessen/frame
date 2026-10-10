import { test, expect, _electron } from '@playwright/test';
import { mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { conversionLibrary, probeConversion } from '../helpers/conversion-library';

test('bulk converts native folders, numbers collisions, and retries only unfinished files', async () => {
  const library = await conversionLibrary();
  const output = join(library.directory, 'Converted');
  await mkdir(join(output, 'Album One'), { recursive: true });
  const conflict = join(output, 'Album One', 'Song.flac'); await writeFile(conflict, 'Existing file');
  const original = await readFile(library.sources[1]);
  const executablePath = process.env.FRAME_TEST_EXECUTABLE;
  const app = await _electron.launch({ executablePath: executablePath ? resolve(executablePath) : undefined,
    args: [`--user-data-dir=${join(library.directory, 'profile')}`, ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []), ...(executablePath ? [] : ['.'])], env: { ...process.env, PATH: '', FRAME_DEV_URL: '' } });
  try {
    const page = await app.firstWindow();
    await page.getByRole('navigation', { name: 'Workflow' }).getByRole('button', { name: 'Convert', exact: true }).click();
    await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, library.root);
    await page.getByRole('button', { name: 'Add folder', exact: true }).click();
    await expect(page.locator('.conversion-table tbody tr')).toHaveCount(2);
    await expect(page.locator('.conversion-import-report')).toContainText('1 file could not be read');
    await expect(page.locator('.conversion-import-report')).toContainText('1 other file skipped');
    await expect(page.locator('audio, video, .timeline-track')).toHaveCount(0);
    await page.getByLabel('Conversion format').selectOption('flac');
    await app.evaluate(({ dialog }) => { dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] }); });
    await page.getByRole('button', { name: 'Convert 2 files', exact: true }).click();
    await expect(page.getByText('Cancelled', { exact: true })).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Clear results', exact: true })).toBeEnabled();
    // A source removed after import must fail alone; the other song remains downloadable/saved.
    await rm(library.sources[1]);
    await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, output);
    await page.getByRole('button', { name: 'Convert 2 files', exact: true }).click();
    await expect(page.getByText('Converted', { exact: true })).toHaveCount(1);
    await expect(page.getByText('Failed', { exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Retry unfinished files' })).toBeEnabled();
    const first = join(output, 'Album One', 'Song-1.flac');
    const firstBytes = await readFile(first);
    expect(await readFile(conflict, 'utf8')).toBe('Existing file');
    await writeFile(library.sources[1], original);
    await page.getByRole('button', { name: 'Retry unfinished files' }).click();
    await expect(page.getByText('Converted', { exact: true })).toHaveCount(2);
    expect((await readdir(join(output, 'Album One'))).sort()).toEqual(['Song-1.flac', 'Song.flac']);
    expect((await readFile(first)).equals(firstBytes)).toBe(true);
    for (const path of [first, join(output, 'Album Two', 'Song.flac')]) {
      const info = await probeConversion(path);
      expect(info.streams[0].codec_name).toBe('flac'); expect(Number(info.format.duration)).toBeCloseTo(2, 2);
      expect(info.format.tags.artist).toBe('Frame Artist'); expect(info.format.tags.title).toBe('Portable Song');
      expect((await readdir(join(path, '..'))).some(name => name.startsWith('.frame-'))).toBe(false);
    }
    await expect(page.getByRole('button', { name: 'Open output folder' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Conversion complete', exact: true })).toBeDisabled();
    // Editor batches share the native coordinator but must not redirect conversion results.
    await app.evaluate(({ dialog, shell }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
      (globalThis as typeof globalThis & { openedConversionFolder: string }).openedConversionFolder = '';
      shell.openPath = async value => { (globalThis as typeof globalThis & { openedConversionFolder: string }).openedConversionFolder = value; return ''; };
    }, library.root);
    await page.evaluate(async () => { const token = await window.frameDesktop!.beginBatch(); if (token) await window.frameDesktop!.endBatch(token); });
    await page.getByRole('button', { name: 'Open output folder' }).click();
    await expect.poll(() => app.evaluate(() => (globalThis as typeof globalThis & { openedConversionFolder: string }).openedConversionFolder)).toBe(await realpath(output));
    await page.getByRole('button', { name: 'Clear results', exact: true }).click();
    await page.getByLabel('Conversion format').selectOption('wav');
    await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, library.root);
    await page.getByRole('button', { name: 'Convert 2 files', exact: true }).click();
    await expect(page.getByText('Converted', { exact: true })).toHaveCount(2);
    expect((await readFile(library.sources[1])).equals(original)).toBe(true);
    expect((await probeConversion(join(library.root, 'Album Two', 'Song-1.wav'))).streams[0].codec_name).toBe('pcm_s16le');
  } finally { await app.close(); await rm(library.directory, { recursive: true, force: true }); }
});

test('keeps custom numbering on retries and applies native audio delivery settings', async () => {
  const library = await conversionLibrary(), output = join(library.directory, 'Named');
  const original = await readFile(library.sources[0]); await mkdir(output);
  const executablePath = process.env.FRAME_TEST_EXECUTABLE;
  const app = await _electron.launch({ executablePath: executablePath ? resolve(executablePath) : undefined, args: [`--user-data-dir=${join(library.directory, 'number-profile')}`, ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []), ...(executablePath ? [] : ['.'])], env: { ...process.env, PATH: '', FRAME_DEV_URL: '' } });
  try {
    const page = await app.firstWindow();
    await page.getByRole('navigation', { name: 'Workflow' }).getByRole('button', { name: 'Convert', exact: true }).click();
    await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, library.root);
    await page.getByRole('button', { name: 'Add folder', exact: true }).click();
    await expect(page.locator('.conversion-table tbody tr')).toHaveCount(2);
    await page.getByLabel('Conversion format').selectOption('wav'); await page.getByText('Advanced options', { exact: true }).click();
    await page.getByLabel('Audio sample rate', { exact: true }).selectOption('16000'); await page.getByLabel('Audio channels', { exact: true }).selectOption('1');
    await page.getByLabel('WAV bit depth', { exact: true }).selectOption('24'); await page.getByLabel('Conversion filename pattern').fill('{index}-{name}');
    await rm(library.sources[0]);
    await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, output);
    await page.getByRole('button', { name: 'Convert 2 files', exact: true }).click();
    await expect(page.getByText('Converted', { exact: true })).toHaveCount(1); await expect(page.getByText('Failed', { exact: true })).toHaveCount(1);
    const second = join(output, 'Album Two', '002-Song.wav'), bytes = await readFile(second);
    await writeFile(library.sources[0], original); await page.getByRole('button', { name: 'Retry unfinished files' }).click();
    await expect(page.getByText('Converted', { exact: true })).toHaveCount(2);
    expect((await readFile(second)).equals(bytes)).toBe(true);
    for (const path of [join(output, 'Album One', '001-Song.wav'), second]) expect((await probeConversion(path)).streams[0]).toMatchObject({ codec_name: 'pcm_s24le', channels: 1, sample_rate: '16000' });
    expect(await readdir(join(output, 'Album One'))).toEqual(['001-Song.wav']);
  } finally { await app.close(); await rm(library.directory, { recursive: true, force: true }); }
});
