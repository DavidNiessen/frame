import { afterAll, beforeAll, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { effectPreviewArgs, effectPreviewRanges, effectPreviewRecipe, needsEffectPreview } from '../src/core/effect-preview';
import { defaultSettings, type MediaAsset } from '../src/core/types';
import { resourcePaths, recipeFiles } from '../src/core/resources';
import { applyPreviewEffects } from '../src/hooks/usePreviewEffects';
import { configurePreviewClock, previewMediaTime, previewSourceTime } from '../src/core/preview-clock';
import { ffmpegPath, probeFile } from '../electron/native';
const exec = promisify(execFile);
let directory: string, tone: string, audio: MediaAsset;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'frame-effects-preview-test-')); tone = join(directory, 'tone.wav');
  await exec(ffmpegPath(), ['-y', '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=4', '-ac', '2', tone]);
  audio = { ...await probeFile(tone), id: 'tone', name: 'tone.wav', previewUrl: '' };
});
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });
it('uses rendered output time through cuts and different local speeds without applying gain or tempo twice', () => {
  const edit = { ...defaultSettings(audio), volume: .5, clips: [{ id: 'a', start: 0, end: 1, effects: { speed: .5 } }, { id: 'b', start: 2, end: 4, effects: { speed: 2 } }] };
  const ranges = effectPreviewRanges(edit);
  expect(previewSourceTime(ranges, 2)).toBe(2); expect(previewSourceTime(ranges, 2.5)).toBe(3); expect(previewMediaTime(ranges, 3)).toBe(2.5);
  const media = { currentTime: 2.5, playbackRate: 2, volume: .5, tagName: 'AUDIO', dataset: { previewEffects: 'rendered' }, style: {} } as unknown as HTMLMediaElement;
  configurePreviewClock(media, ranges); applyPreviewEffects(media, edit);
  expect(media.playbackRate).toBe(1); expect(media.volume).toBe(1);
});
it('does not regenerate rendered audio/color when interactive frame objects, geometry or delivery settings change', () => {
  const video = { ...audio, kind: 'video' as const, width: 640, height: 360 }, edit = { ...defaultSettings(video), equalizer: { bass: 0, mid: 6, treble: 0 } };
  expect(needsEffectPreview(defaultSettings(video))).toBe(false); expect(needsEffectPreview(edit)).toBe(true);
  const changed = { ...edit, crop: { x: 10, y: 10, width: 100, height: 100 }, overlays: { ...edit.overlays, text: 'Editable' }, quality: 'high' as const, videoBitrate: 10000, format: 'gif' as const };
  expect(effectPreviewRecipe(video, changed)).toEqual(effectPreviewRecipe(video, edit));
  expect(needsEffectPreview({ ...defaultSettings(video), color: { ...edit.color, temperature: .5 } })).toBe(true);
  expect(needsEffectPreview({ ...defaultSettings(video), reduceNoise: true })).toBe(true);
  expect(needsEffectPreview({ ...defaultSettings(video), normalizeLoudness: true })).toBe(true);
});
it('renders audible EQ only inside its output interval and includes one copy of the base gain', async () => {
  const edit = effectPreviewRecipe(audio, { ...defaultSettings(audio), volume: .5, effectInstances: [{ id: 'eq', effect: 'equalizer', timeSpace: 'output', range: { start: 0, end: 2 }, settings: { equalizer: { bass: 0, mid: -12, treble: 0 } } }] });
  const output = join(directory, 'processed.mp3');
  await exec(ffmpegPath(), effectPreviewArgs(audio, edit, tone, output, resourcePaths()), { env: { ...process.env, PATH: '' } });
  const rms = async (path: string, start: number) => {
    const { stdout } = await exec(ffmpegPath(), ['-v', 'error', '-ss', String(start), '-i', path, '-t', '0.5', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { encoding: 'buffer' });
    let sum = 0; for (let i = 0; i < stdout.length; i += 4) sum += stdout.readFloatLE(i) ** 2;
    return Math.sqrt(sum / (stdout.length / 4));
  };
  const reference = join(directory, 'reference.mp3');
  await exec(ffmpegPath(), effectPreviewArgs(audio, effectPreviewRecipe(audio, defaultSettings(audio)), tone, reference, resourcePaths()));
  const original = await rms(reference, .5);
  expect(await rms(output, .5) / original).toBeCloseTo(.5 * 10 ** (-12 / 20), 2);
  // MP3 encoding has a small level tolerance; doubling gain would be far outside it.
  expect(await rms(output, 2.5) / original).toBeGreaterThan(.48);
  expect(await rms(output, 2.5) / original).toBeLessThan(.52);
  expect((await probeFile(output)).duration).toBeCloseTo(4, 1);
});
it('renders a real LUT and temperature on a reordered/speed-adjusted lightweight video', async () => {
  const input = resolve('tests/fixtures/sample.mp4'), video = { ...await probeFile(input), id: 'video', name: 'sample.mp4', previewUrl: '' };
  const lut = 'LUT_3D_SIZE 2\n' + Array(8).fill('1 0 0').join('\n') + '\n';
  const edit = effectPreviewRecipe(video, { ...defaultSettings(video), color: { ...defaultSettings(video).color, temperature: .5, lut, lutName: 'red.cube' }, clips: [{ id: 'a', start: 4, end: 6, effects: { speed: 2 } }, { id: 'b', start: 0, end: 2, effects: {} }] });
  const paths = resourcePaths(join(directory, 'color')), output = join(directory, 'processed.mp4');
  for (const file of recipeFiles(edit, paths, video)) await writeFile(file.path, file.text);
  await exec(ffmpegPath(), effectPreviewArgs(video, edit, input, output, paths));
  const prepared = await probeFile(output); expect(prepared.duration).toBeCloseTo(3, 1); expect(prepared.width).toBeLessThanOrEqual(720);
  const { stdout } = await exec(ffmpegPath(), ['-v', 'error', '-i', output, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer' });
  expect(stdout[0]).toBeGreaterThan(220); expect(stdout[1]).toBeLessThan(25); expect(stdout[2]).toBeLessThan(25);
});
