import { expect, test, _electron } from '@playwright/test';
import { readFile, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { conversionLibrary } from '../helpers/conversion-library';
import { defaultSettings } from '../../src/core/types';
test('records real saved exports, restores history and forgets entries without deleting files', async () => {
  const library = await conversionLibrary(), executablePath = process.env.FRAME_TEST_EXECUTABLE, profile = join(library.directory, 'profile');
  const launch = () => _electron.launch({ executablePath: executablePath ? resolve(executablePath) : undefined, args: [`--user-data-dir=${profile}`, ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []), ...(executablePath ? [] : ['.'])], env: { ...process.env, PATH: '', FRAME_DEV_URL: '' } });
  let app = await launch();
  try {
    const page = await app.firstWindow(), output = join(library.directory, 'saved.wav');
    await app.evaluate(({ dialog }, paths) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paths.input] }); dialog.showSaveDialog = async () => ({ canceled: false, filePath: paths.output }); }, { input: library.sources[0], output });
    const source = (await page.evaluate(() => window.frameDesktop!.importFiles())).assets[0];
    const result = await page.evaluate(({ id, edit }) => window.frameDesktop!.export(id, edit), { id: source.id, edit: { ...defaultSettings(source), format: 'wav' as const } });
    expect(result?.path).toBe(output);
    const entries = (await page.evaluate(() => window.frameDesktop!.exportHistory())).entries;
    expect(entries).toHaveLength(1); expect(entries[0]).toMatchObject({ name: 'saved.wav', kind: 'export', path: output, source: 'Song.wav', format: 'wav' });
    await app.evaluate(({ shell }) => { shell.showItemInFolder = path => { (globalThis as typeof globalThis & { revealed: string }).revealed = path; }; });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const card = page.locator('section[aria-labelledby="history-heading"]');
    await expect(card.getByText('saved.wav', { exact: true })).toBeVisible(); await card.getByRole('button', { name: 'Show saved.wav in folder' }).click();
    expect(await app.evaluate(() => (globalThis as typeof globalThis & { revealed: string }).revealed)).toBe(output);
    await page.getByLabel('Search recent exports').fill('no matching name'); await expect(card.getByText('No matching saved files.')).toBeVisible();
    await page.getByLabel('Search recent exports').fill(''); await app.close(); app = await launch();
    const restored = await app.firstWindow(); await restored.getByRole('button', { name: 'Settings', exact: true }).click(); await expect(restored.locator('.recent-export-list strong')).toHaveText('saved.wav');
    expect(JSON.parse(await readFile(join(profile, 'recent-exports.json'), 'utf8')).entries).toHaveLength(1);
    await restored.getByRole('button', { name: 'Forget saved.wav' }).click(); await expect(restored.locator('.recent-export-list li')).toHaveCount(0); expect((await stat(output)).size).toBeGreaterThan(1000);
    await expect(restored.evaluate(id => window.frameDesktop!.revealExport(id), entries[0].id)).rejects.toThrow('no longer');
    expect((await restored.evaluate(() => window.frameDesktop!.clearExportHistory())).entries).toEqual([]);
  } finally { await app.close(); await rm(library.directory, { recursive: true, force: true }); }
});
