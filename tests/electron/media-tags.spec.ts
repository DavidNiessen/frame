import { expect, test, _electron } from '@playwright/test';
import { mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { conversionLibrary, probeConversion } from '../helpers/conversion-library';
import { defaultSettings } from '../../src/core/types';
test('uses edited tags in native bulk filenames and records the actual saved outputs', async () => {
  const library = await conversionLibrary(), executablePath = process.env.FRAME_TEST_EXECUTABLE, output = join(library.directory, 'outputs'); await mkdir(output);
  const app = await _electron.launch({ executablePath: executablePath ? resolve(executablePath) : undefined, args: [`--user-data-dir=${join(library.directory, 'profile')}`, ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []), ...(executablePath ? [] : ['.'])], env: { ...process.env, PATH: '', FRAME_DEV_URL: '' } });
  try {
    const page = await app.firstWindow(); await app.evaluate(({ dialog }, sources) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: sources }); }, library.sources); const assets = (await page.evaluate(() => window.frameDesktop!.importFiles())).assets;
    await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, output); const token = await page.evaluate(ids => window.frameDesktop!.beginBatch({ conversion: true, namingTemplate: '{album}-{track}-{title}', order: ids }), assets.map(asset => asset.id));
    for (const [index, asset] of assets.entries()) {
      const result = await page.evaluate(({ id, edit, token }) => window.frameDesktop!.export(id, edit, token!), { id: asset.id, edit: { ...defaultSettings(asset), format: 'flac' as const, outputTags: { album: 'Collected songs', artist: '' } }, token }); expect(result?.name).toBe(`Collected songs-00${index + 1}-Portable Song.flac`); const tags = (await probeConversion(result!.path!)).format.tags; expect(tags.album).toBe('Collected songs'); expect(tags.artist).toBeUndefined();
    }
    await page.evaluate(token => window.frameDesktop!.endBatch(token!), token); const history = await page.evaluate(() => window.frameDesktop!.exportHistory()); expect(history.entries.map(entry => entry.kind)).toEqual(['conversion', 'conversion']);
  } finally { await app.close(); await rm(library.directory, { recursive: true, force: true }); }
});
