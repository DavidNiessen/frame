import { afterAll, beforeAll, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ffmpegPath, probeFile } from '../electron/native';
import { defaultSettings, type MediaAsset } from '../src/core/types';
import { defaultShape, parseShape, shapeKinds } from '../src/core/shapes';
import { buildExportArgs } from '../src/core/export-plan';
import { snapFrameMovement } from '../src/core/canvas-guides';
import { addTimelineEffect } from '../src/core/timeline-effects';
const exec = promisify(execFile);
let dir: string, input: string, asset: MediaAsset;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'frame-shapes-'));
  input = join(dir, 'source.png');
  await exec(ffmpegPath(), [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=0x203040@0.5:s=64x48,format=rgba',
    '-frames:v',
    '1',
    '-threads',
    '1',
    input,
  ]);
  asset = { ...(await probeFile(input)), id: 'image', name: 'source.png', previewUrl: '' };
});
afterAll(async () => rm(dir, { recursive: true, force: true }));
it.each(shapeKinds)('exports a real %s shape with source transparency preserved', async (kind) => {
  const edit = {
      ...defaultSettings(asset),
      shape: { ...defaultShape(), kind, fill: '#ff0000', strokeWidth: 0 },
    },
    out = join(dir, kind + '.png');
  await exec(ffmpegPath(), buildExportArgs(asset, edit, input, out));
  const pixels = (
      await exec(
        ffmpegPath(),
        [
          '-v',
          'error',
          '-i',
          out,
          '-frames:v',
          '1',
          '-f',
          'rawvideo',
          '-pix_fmt',
          'rgba',
          '-threads',
          '1',
          '-',
        ],
        { encoding: 'buffer' },
      )
    ).stdout,
    center = (22 * 64 + 32) * 4;
  expect(pixels[center]).toBeGreaterThan(240);
  expect(pixels[center + 1]).toBeLessThan(10);
  expect(pixels[center + 3]).toBe(255);
  expect(pixels[3]).toBeGreaterThanOrEqual(126);
  expect(pixels[3]).toBeLessThanOrEqual(128);
});
it('exports an independently timed shape in a video', async () => {
  const source = join(dir, 'source.mp4');
  await exec(ffmpegPath(), [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=0x202020:s=128x96:r=10:d=2',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    source,
  ]);
  const video = { ...(await probeFile(source)), id: 'video', name: 'source.mp4', previewUrl: '' },
    edit = defaultSettings(video),
    patch = addTimelineEffect(edit, video, 'shape');
  patch.effectInstances![0].range = { start: 0.5, end: 1.5 };
  patch.effectInstances![0].settings.shape = { ...defaultShape(), fill: '#ff0000', strokeWidth: 0 };
  const out = join(dir, 'shape.mp4');
  await exec(ffmpegPath(), buildExportArgs(video, { ...edit, ...patch }, source, out));
  const sample = async (time: number) =>
    (
      await exec(
        ffmpegPath(),
        [
          '-v',
          'error',
          '-ss',
          String(time),
          '-i',
          out,
          '-vf',
          'crop=2:2:64:42',
          '-frames:v',
          '1',
          '-f',
          'rawvideo',
          '-pix_fmt',
          'rgb24',
          '-threads',
          '1',
          '-',
        ],
        { encoding: 'buffer' },
      )
    ).stdout;
  expect((await sample(0.1))[0]).toBeLessThan(45);
  expect((await sample(0.8))[0]).toBeGreaterThan(230);
});
it('snaps object edges and centers to the frame and other objects', () => {
  const frame = { left: 0, top: 0, width: 200, height: 100 },
    object = { left: 80, top: 40, width: 40, height: 20 };
  expect(snapFrameMovement(object, frame, 5, -4, [])).toMatchObject({
    dx: 0,
    dy: 0,
    x: 0.5,
    y: 0.5,
  });
  expect(
    snapFrameMovement({ ...object, left: 10 }, frame, 10, 0, [
      { left: 64, top: 10, width: 20, height: 20 },
    ]),
  ).toMatchObject({ dx: 14, x: 0.32 });
  expect(snapFrameMovement(object, frame, 20, 20, [], 2)).toMatchObject({ dx: 20, dy: 20 });
});
it('rejects invalid geometry and arbitrary shape colors', () => {
  expect(() => parseShape({ ...defaultShape(), width: 200 })).toThrow();
  expect(() => parseShape({ ...defaultShape(), fill: 'red;movie=bad' })).toThrow();
});
