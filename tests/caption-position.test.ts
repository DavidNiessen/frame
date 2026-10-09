import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ffmpegPath } from '../electron/native';
import { outputCues, parseSubtitles, serializeCaptionAss } from '../src/core/subtitles';
import { parseEdit } from '../src/core/project';
import { recipeFiles, resourcePaths } from '../src/core/resources';
import { buildExportArgs } from '../src/core/export-plan';
import { defaultSettings, type MediaAsset } from '../src/core/types';
const ffmpeg = ffmpegPath();
const exec = promisify(execFile);
const asset: MediaAsset = { id: 'clip', name: 'clip.mp4', size: 1, kind: 'video', hasAudio: false, duration: 4, width: 640, height: 360, previewUrl: '' };

it('preserves per-caption positions through project parsing, cuts and speed changes', () => {
  const subtitles = parseSubtitles({ mode: 'burn', cues: [{ start: .5, end: 3.5, text: 'Placed caption', position: { x: 25, y: 30 } }] });
  const edit = parseEdit(JSON.parse(JSON.stringify({ ...defaultSettings(asset), subtitles, speed: 2, cuts: [{ start: 1, end: 2 }] })), asset);
  expect(outputCues(edit)).toEqual([
    { start: .25, end: .5, text: 'Placed caption', position: { x: 25, y: 30 } },
    { start: .5, end: 1.25, text: 'Placed caption', position: { x: 25, y: 30 } },
  ]);
  const old = parseSubtitles({ mode: 'burn', cues: [{ start: 0, end: 1, text: 'Legacy' }] });
  expect(old.cues[0]).toEqual({ start: 0, end: 1, text: 'Legacy' });
  for (const position of [{ x: -1, y: 50 }, { x: 50, y: 101 }, { x: NaN, y: 50 }, null, { x: '50', y: 50 }]) {
    expect(() => parseSubtitles({ mode: 'burn', cues: [{ start: 0, end: 1, text: 'Invalid', position }] })).toThrow('Invalid caption position');
  }
});

it('uses positioned ASS for burn-in and plain SRT for selectable subtitles', () => {
  const edit = { ...defaultSettings(asset), subtitles: parseSubtitles({ mode: 'burn', cues: [{ start: 0, end: 1, text: 'Line one\n{literal}', position: { x: 25, y: 30 } }] }) };
  expect(recipeFiles(edit, resourcePaths('test', 'burn'), asset)[0]).toMatchObject({ path: 'test-captions.ass' });
  expect(serializeCaptionAss(outputCues(edit), asset as { width: number; height: number })).toContain('{\\pos(160,108)}Line one\\N\\{literal\\}');
  const selectable = { ...edit, subtitles: { ...edit.subtitles, mode: 'embed' as const } };
  expect(recipeFiles(selectable, resourcePaths('test', 'embed'), asset)[0]).toEqual({ path: 'test-captions.srt', text: '1\n00:00:00,000 --> 00:00:01,000\nLine one\n{literal}\n' });
});

it('renders moved captions at their output coordinates after cropping and rotation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-caption-position-'));
  try {
    const input = join(directory, 'black.mp4'), output = join(directory, 'positioned.mp4');
    await exec(ffmpeg!, ['-y', '-f', 'lavfi', '-i', 'color=black:s=640x360:d=1', input]);
    const edit = { ...defaultSettings(asset), end: 1, crop: { x: 0, y: 0, width: 320, height: 360 }, geometry: { ...defaultSettings(asset).geometry, rotation: 90 as const }, subtitles: parseSubtitles({ mode: 'burn', cues: [{ start: 0, end: 1, text: 'PLACED', position: { x: 25, y: 30 } }] }) };
    const paths = { ...resourcePaths(join(directory, 'clip'), 'burn'), fonts: resolve('public/fonts') };
    for (const file of recipeFiles(edit, paths, asset)) await writeFile(file.path, file.text);
    await exec(ffmpeg!, buildExportArgs(asset, edit, input, output, paths));
    const { stdout: pixels } = await exec(ffmpeg!, ['-v', 'error', '-i', output, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer', maxBuffer: 2_000_000 });
    const xs: number[] = [], ys: number[] = [];
    for (let i = 0; i < pixels.length; i += 3) if (pixels[i] > 200 && pixels[i + 1] > 200 && pixels[i + 2] > 200) { xs.push(i / 3 % 360); ys.push(Math.floor(i / 3 / 360)); }
    expect(xs.length).toBeGreaterThan(30);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(360 * .25, -1);
    expect(Math.max(...ys)).toBeGreaterThan(320 * .30 - 8);
    expect(Math.max(...ys)).toBeLessThanOrEqual(320 * .30);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
