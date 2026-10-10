import { expect, test, _electron } from '@playwright/test';
import { rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { conversionLibrary, probeConversion } from '../helpers/conversion-library';
import { sceneFixture } from '../helpers/scenes';
import { defaultSettings } from '../../src/core/types';
import { sourceIdentity } from '../../src/core/project';
import { outputSettings } from '../../src/core/presets';
test('analyzes native scenes and loudness and exports music mixes, contact sheets and merges', async () => {
  const library = await conversionLibrary(), scenes = await sceneFixture(), executablePath = process.env.FRAME_TEST_EXECUTABLE;
  const app = await _electron.launch({ executablePath: executablePath ? resolve(executablePath) : undefined, args: [`--user-data-dir=${join(library.directory, 'profile')}`, ...(process.env.FRAME_TEST_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-gpu'] : []), ...(executablePath ? [] : ['.'])], env: { ...process.env, PATH: '', FRAME_DEV_URL: '' } });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ dialog }, paths) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths }); }, [scenes.source, library.sources[0]]);
    const sources = await page.evaluate(() => window.frameDesktop!.importFiles()); expect(sources.issues).toEqual([]);
    const [video, music] = sources.assets;
    const options = { threshold: .25, minGap: .5 }, scan = await page.evaluate(({ id, options }) => window.frameDesktop!.detectScenes(id, options), { id: video.id, options }); expect(scan.times).toEqual([1, 2]);
    const edit = { ...defaultSettings(video), audioChannels: 1, includeChapters: true, markers: [{ id: 'chapter', time: .75, name: 'Second scene', color: 'violet' as const }], audioLayers: [{ id: 'music', source: sourceIdentity(music), start: .5, end: 3, sourceStart: 0, sourceEnd: music.duration, volume: .5, fadeIn: .1, fadeOut: .2, loop: true, muted: false }] };
    const stats = await page.evaluate(({ id, edit }) => window.frameDesktop!.measureLoudness(id, edit), { id: video.id, edit }); expect(stats.integrated).toBeLessThan(-15); expect(stats.truePeak).toBeLessThan(-1);
    const preview = await page.evaluate(({ id, edit }) => window.frameDesktop!.previewAudio(id, edit).then(bytes => Array.from(bytes.slice(0, 4))), { id: video.id, edit }); expect(Buffer.from(preview).toString()).toBe('RIFF');
    const sheet = await page.evaluate(({ id, edit }) => window.frameDesktop!.contactSheet(id, edit, { columns: 2, rows: 2, width: 160, timestamps: true }).then(bytes => Array.from(bytes)), { id: video.id, edit }); const png = Buffer.from(sheet); expect(png.subarray(1, 4).toString()).toBe('PNG'); expect(png.readUInt32BE(16)).toBe(344); expect(png.readUInt32BE(20)).toBe(252); await writeFile(join(library.directory, 'sheet.png'), png);
    const output = join(library.directory, 'mixed.mp4'); await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, output);
    expect(await page.evaluate(({ id, edit }) => window.frameDesktop!.export(id, edit), { id: video.id, edit })).toMatchObject({ path: output }); const info = await probeConversion(output); expect(info.chapters.map((chapter: { start_time: string }) => Number(chapter.start_time))).toEqual([0, .75]); expect(info.streams.find((stream: { codec_type: string }) => stream.codec_type === 'audio')).toMatchObject({ channels: 1 });
    const merged = join(library.directory, 'merged.mp4'); await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, merged);
    await page.evaluate(({ id, edit, settings }) => window.frameDesktop!.merge([{ id, edit }, { id, edit }], settings), { id: video.id, edit, settings: outputSettings(edit) }); expect(Number((await probeConversion(merged)).format.duration)).toBeCloseTo(6, 1);
  } finally { await app.close(); await rm(library.directory, { recursive: true, force: true }); await rm(scenes.directory, { recursive: true, force: true }); }
});
