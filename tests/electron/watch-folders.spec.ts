import { expect, test, _electron } from '@playwright/test';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { conversionLibrary, probeConversion } from '../helpers/conversion-library';
test('watches stable new files, preserves collisions, pauses, and remembers conversions across restarts', async () => {
  test.setTimeout(90000);
  const library = await conversionLibrary(), output = join(library.directory, 'Converted'), profile = join(library.directory, 'profile'); await mkdir(output);
  const executablePath = process.env.FRAME_TEST_EXECUTABLE;
  const launch = () => _electron.launch({ executablePath: executablePath ? resolve(executablePath) : undefined, args: [`--user-data-dir=${profile}`, ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []), ...(executablePath ? [] : ['.'])], env: { ...process.env, PATH: '', FRAME_DEV_URL: '' } });
  let app = await launch();
  try {
    let page = await app.firstWindow(); await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await app.evaluate(({ dialog }, paths) => { let index = 0; dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paths[index++ % 2]] }); }, [library.root, output]);
    await page.getByRole('button', { name: 'Add watch folder', exact: true }).click(); await expect(page.getByRole('dialog', { name: 'Add watch folder' })).toBeVisible();
    await page.getByLabel('Watch name', { exact: true }).fill('Music inbox'); await page.getByRole('button', { name: 'Start watching', exact: true }).click(); await expect(page.getByLabel('Enable Music inbox')).toBeChecked();
    const draft = await page.evaluate(() => window.frameDesktop!.watchFoldersStatus().then(status => status.watches[0]));
    await expect(page.evaluate(value => window.frameDesktop!.addWatchFolder(value), draft)).rejects.toThrow('native folder picker');
    await app.evaluate(({ dialog }, paths) => { let index = 0; dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paths[index++ % 2]] }); }, [output, library.root]);
    await page.evaluate(() => window.frameDesktop!.chooseWatchFolders());
    await expect(page.evaluate(value => window.frameDesktop!.addWatchFolder({ ...value, input: value.output, output: value.input }), draft)).rejects.toThrow('re-enter');
    expect((await page.evaluate(() => window.frameDesktop!.watchFoldersStatus())).watches).toHaveLength(1);
    // Initial songs are skipped; colliding output files stay intact.
    expect(await readdir(output)).toEqual([]); await mkdir(join(output, 'Album One')); const target = join(output, 'Album One', 'New.flac'); await writeFile(target, 'Existing');
    const incoming = join(library.root, 'Album One', 'New.wav'), bytes = await readFile(library.sources[0]);
    await writeFile(incoming, bytes.subarray(0, Math.floor(bytes.length / 2)));
    // Change the source before its next scan; only the complete waveform should be encoded.
    await writeFile(incoming, bytes); const saved = join(output, 'Album One', 'New-1.flac');
    await expect.poll(async () => (await readdir(join(output, 'Album One'))).includes('New-1.flac'), { timeout: 20000 }).toBe(true);
    expect((await probeConversion(saved)).streams[0].codec_name).toBe('flac'); expect(await readFile(target, 'utf8')).toBe('Existing');
    await page.getByLabel('Enable Music inbox').uncheck(); await copyFile(library.sources[1], join(library.root, 'Paused.wav'));
    await expect.poll(() => page.evaluate(() => window.frameDesktop!.watchFoldersStatus().then(value => value.watches[0].enabled))).toBe(false);
    expect((await readdir(output)).includes('Paused.flac')).toBe(false); await page.getByLabel('Enable Music inbox').check();
    await expect.poll(async () => (await readdir(output)).includes('Paused.flac'), { timeout: 20000 }).toBe(true);
    await app.close(); app = await launch(); page = await app.firstWindow(); await page.getByRole('button', { name: 'Settings', exact: true }).click(); await expect(page.getByLabel('Enable Music inbox')).toBeChecked();
    await copyFile(library.sources[0], join(library.root, 'Restart.wav')); await expect.poll(async () => (await readdir(output)).includes('Restart.flac'), { timeout: 20000 }).toBe(true);
    expect((await readdir(join(output, 'Album One'))).sort()).toEqual(['New-1.flac', 'New.flac']); expect((await readdir(output)).sort()).toEqual(['Album One', 'Paused.flac', 'Restart.flac']);
    await page.getByRole('button', { name: 'Remove watch Music inbox' }).click(); await expect(page.getByLabel('Enable Music inbox')).toHaveCount(0);
  } finally { await app.close(); await rm(library.directory, { recursive: true, force: true }); }
});
