import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ffmpegPath } from '../electron/native';
import { buildExportArgs } from '../src/core/export-plan';
import { buildMergeArgs } from '../src/core/composition';
import { framePreviewArgs } from '../src/core/frame-preview';
import { recipeFiles, recipeImages, resourcePaths } from '../src/core/resources';
import { overlayIntervals, parseOverlays, textAss } from '../src/core/overlays';
import { defaultSettings, type MediaAsset } from '../src/core/types';
import { editClips, splitClip } from '../src/core/clips';
import { effectAction } from '../src/core/effect-actions';
import { changeInstance, definitionFor, extraInstances } from '../src/core/effect-instances';
import { parseEdit } from '../src/core/project';
const exec = promisify(execFile), ffmpeg = ffmpegPath()!;
const asset: MediaAsset = { id: 'black', name: 'black.mp4', duration: 6, kind: 'video', hasAudio: false, width: 96, height: 64, size: 1, previewUrl: '' };
it('validates portable watermark ranges and preserves untimed legacy overlays', () => {
  const edit = defaultSettings(asset);
  expect(parseOverlays(edit.overlays)).toEqual(edit.overlays);
  expect(textAss(edit, asset)).toContain('0:00:00.00,24:00:00.00');
  for (const range of [{ start: -1, end: 2 }, { start: 2, end: 2 }, { start: 0, end: Infinity }, { start: 0, end: 86401 }]) expect(() => parseOverlays({ ...edit.overlays, range })).toThrow('timing');
  expect(overlayIntervals({ ...edit, start: 1, end: 5, cuts: [{ start: 2, end: 3 }], speed: 2, overlays: { ...edit.overlays, range: { start: 1.5, end: 4 } } })).toEqual([{ start: .25, end: .5 }, { start: .5, end: 1 }]);
});
it('exports independent timed artwork and text through trimming, reordering, speeds, merging and frame previews', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-timed-overlays-'));
  try {
    const input = join(directory, 'black.mp4');
    await exec(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=black:s=96x64:r=20:d=6', '-c:v', 'libx264', '-threads', '1', input]);
    const images: string[] = [];
    for (const color of ['red', 'lime']) {
      const file = join(directory, `${color}.png`);
      await exec(ffmpeg, ['-y', '-f', 'lavfi', '-i', `color=${color}:s=16x16`, '-frames:v', '1', '-threads', '1', file]);
      images.push(`data:image/png;base64,${(await readFile(file)).toString('base64')}`);
    }
    let edit = { ...defaultSettings(asset), start: .5, end: 5.5 };
    for (const current of [1, 4]) edit = { ...edit, ...effectAction(edit, asset, definitionFor('watermark'), null, 'add', current) };
    edit.overlays = { ...edit.overlays, image: images[0], x: 50, y: 50, imageWidth: 50, text: 'Timed', size: 12, range: { start: 1, end: 4 } };
    edit = { ...edit, ...changeInstance(edit, extraInstances(edit, 'watermark')[0].id, null, { overlays: { ...edit.overlays, image: images[1], text: '', range: { start: 4, end: 5 } } }) };
    edit = { ...edit, ...splitClip(edit, editClips(edit)[0].id, 2.5) };
    edit.clips![0].effects.speed = 2; edit.clips!.reverse();
    edit = parseEdit(JSON.parse(JSON.stringify(edit)), asset);
    expect(overlayIntervals(edit)).toEqual([{ start: 0, end: 1.5 }, { start: 3.25, end: 4 }]);
    const paths = { ...resourcePaths(join(directory, 'overlay')), fonts: resolve('public/fonts') };
    for (const file of recipeFiles(edit, paths, asset)) await writeFile(file.path, file.text);
    for (const image of recipeImages(edit, paths)) await writeFile(image.path, Buffer.from(image.data.split(',')[1], 'base64'));
    expect(await readFile(paths.text, 'utf8')).toContain('0:00:03.25,0:00:04.00');
    const output = join(directory, 'timed.mp4'); await exec(ffmpeg, buildExportArgs(asset, edit, input, output, paths));
    async function pixel(file: string, time?: number) {
      const { stdout } = await exec(ffmpeg, ['-v', 'error', ...(time === undefined ? [] : ['-ss', String(time)]), '-i', file, '-vf', 'crop=2:2:iw/2-1:ih/2-1', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer', maxBuffer: 2_000_000 });
      return [...stdout.subarray(0, 3)];
    }
    const red = await pixel(output, .5), green = await pixel(output, 2);
    expect(red[0]).toBeGreaterThan(200); expect(red[1]).toBeLessThan(50);
    expect(green[1]).toBeGreaterThan(200); expect(green[0]).toBeLessThan(50);
    expect((await pixel(output, 2.8)).every(value => value < 20)).toBe(true);
    expect((await pixel(output, 3.1)).every(value => value < 20)).toBe(true);
    expect((await pixel(output, 3.6))[0]).toBeGreaterThan(200);
    for (const [source, channel] of [[4.5, 1], [1.5, 0]]) {
      const preview = join(directory, `preview-${source}.png`);
      await exec(ffmpeg, framePreviewArgs(asset, edit, source, input, preview, paths));
      expect((await pixel(preview))[channel]).toBeGreaterThan(200);
    }
    const outside = join(directory, 'preview-outside.png'); await exec(ffmpeg, framePreviewArgs(asset, edit, 5.2, input, outside, paths));
    expect((await pixel(outside)).every(value => value < 20)).toBe(true);
    const merged = join(directory, 'merged.mp4');
    await exec(ffmpeg, buildMergeArgs([{ asset, edit }, { asset, edit }], edit, [input, input], merged, undefined, [paths, paths]));
    expect((await pixel(merged, 6))[1]).toBeGreaterThan(200); expect((await pixel(merged, 7.6))[0]).toBeGreaterThan(200);
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 30000);
