import { beforeAll, afterAll, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  keyframeValue,
  parseKeyframeTrack,
  setKeyframe,
  type KeyframeTrack,
} from '../src/core/keyframes';
import { insertedMediaLayer, resizeMediaLayer, splitMediaLayer } from '../src/core/media-layers';
import { defaultSettings, type MediaAsset } from '../src/core/types';
import { resourcePaths } from '../src/core/resources';
import { buildExportArgs } from '../src/core/export-plan';
import { ffmpegPath, probeFile, runFfmpeg } from '../electron/native';
import { encodePixelsPng } from '../src/core/png-encoding';
import { insertedAudioLayer } from '../src/core/media-insertion';
import { createProject, parseProject } from '../src/core/project';
const exec = promisify(execFile);
let dir: string,
  input: string,
  picture: string,
  asset: MediaAsset,
  photo: MediaAsset,
  audio: MediaAsset,
  audioPath: string;
const track: KeyframeTrack = {
  interpolation: 'linear',
  keys: [
    { time: 0, value: 0 },
    { time: 2, value: 100 },
  ],
};
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'frame-keyframes-'));
  input = join(dir, 'base.mp4');
  picture = join(dir, 'red.png');
  audioPath = join(dir, 'tone.wav');
  await exec(ffmpegPath(), [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=blue:size=64x48:rate=10',
    '-t',
    '3',
    '-c:v',
    'libx264',
    input,
  ]);
  const pixels = new Uint8ClampedArray(64 * 48 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([255, 0, 0, 255], i);
  await writeFile(picture, encodePixelsPng(64, 48, pixels));
  await exec(ffmpegPath(), [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=3',
    audioPath,
  ]);
  asset = { ...(await probeFile(input)), id: 'base', name: 'base.mp4', previewUrl: '' };
  photo = { ...(await probeFile(picture)), id: 'photo', name: 'red.png', previewUrl: '' };
  audio = { ...(await probeFile(audioPath)), id: 'audio', name: 'tone.wav', previewUrl: '' };
});
afterAll(async () => rm(dir, { recursive: true, force: true }));
it('evaluates linear, smooth and hold easing with clamped endpoints and ordered updates', () => {
  expect(keyframeValue(track, 1, 0)).toBe(50);
  expect(keyframeValue({ ...track, interpolation: 'smooth' }, 0.5, 0)).toBeCloseTo(15.625);
  expect(keyframeValue({ ...track, interpolation: 'hold' }, 1, 0)).toBe(0);
  expect(keyframeValue(track, 3, 0)).toBe(100);
  expect(setKeyframe(track, 1, 20).keys).toHaveLength(3);
  expect(() =>
    parseKeyframeTrack(
      {
        ...track,
        keys: [
          { time: 2, value: 0 },
          { time: 1, value: 0 },
        ],
      },
      0,
      100,
    ),
  ).toThrow();
});
it.each(['contain', 'cover', 'stretch'] as const)(
  'exports moving, resizing and fading picture keyframes with %s fit',
  async (fit) => {
    const edit = defaultSettings(asset),
      layer = {
        ...insertedMediaLayer(edit, asset, photo, 0),
        fit,
        x: 0,
        y: 0,
        width: 25,
        height: 25,
        animation: {
          x: {
            ...track,
            keys: [
              { time: 0, value: 0 },
              { time: 2, value: 50 },
            ],
          },
          width: {
            ...track,
            keys: [
              { time: 0, value: 25 },
              { time: 2, value: 50 },
            ],
          },
          height: {
            ...track,
            keys: [
              { time: 0, value: 25 },
              { time: 2, value: 50 },
            ],
          },
          opacity: {
            ...track,
            keys: [
              { time: 0, value: 1 },
              { time: 2, value: 0 },
            ],
          },
        },
      };
    edit.mediaLayers = [layer];
    const out = join(dir, `motion-${fit}.mp4`);
    await exec(
      ffmpegPath(),
      buildExportArgs(asset, edit, input, out, {
        ...resourcePaths(),
        media: { [layer.id]: picture },
      }),
    );
    const frame = async (t: number) =>
      (
        await exec(
          ffmpegPath(),
          [
            '-v',
            'error',
            '-ss',
            String(t),
            '-i',
            out,
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
    const start = await frame(0.1),
      middle = await frame(1),
      end = await frame(2.1);
    expect(start[(4 * 64 + 4) * 3]).toBeGreaterThan(180);
    expect(middle[(4 * 64 + 20) * 3]).toBeGreaterThan(70);
    expect(end[(4 * 64 + 40) * 3 + 2]).toBeGreaterThan(200);
    expect(
      parseProject(
        createProject(
          'Motion',
          [asset, photo],
          (id) => (id === asset.id ? edit : defaultSettings(photo)),
          asset.id,
        ),
      ).sources[0].edit.mediaLayers?.[0].animation,
    ).toEqual(layer.animation);
  },
);
it('preserves keyframe trajectories when trimming and splitting a track', () => {
  const edit = defaultSettings(asset),
    layer = { ...insertedMediaLayer(edit, asset, photo, 0), animation: { x: track } };
  edit.mediaLayers = [layer];
  const trimmed = { ...edit, ...resizeMediaLayer(edit, layer, { start: 0.5, end: 2.5 }) };
  expect(keyframeValue(trimmed.mediaLayers![0].animation!.x, 0, 0)).toBe(25);
  const split = { ...edit, ...splitMediaLayer(edit, layer.id, 1) };
  expect(keyframeValue(split.mediaLayers![1].animation!.x, 0, 0)).toBe(50);
});
it('exports per-frame audio volume automation', async () => {
  const edit = defaultSettings(asset),
    layer = {
      ...insertedAudioLayer(edit, audio, 0),
      volumeKeyframes: {
        ...track,
        keys: [
          { time: 0, value: 0 },
          { time: 2, value: 1 },
        ],
      },
    };
  edit.audioLayers = [layer];
  edit.format = 'wav';
  edit.audioMixProtectPeaks = false;
  const out = join(dir, 'volume.wav');
  await exec(
    ffmpegPath(),
    buildExportArgs(asset, edit, input, out, resourcePaths(), [{ layer, path: audioPath }]),
  );
  const samples = (
    await exec(
      ffmpegPath(),
      ['-v', 'error', '-i', out, '-f', 'f32le', '-ac', '1', '-ar', '16000', '-'],
      { encoding: 'buffer' },
    )
  ).stdout;
  const rms = (at: number) => {
    let sum = 0;
    for (let i = Math.round(at * 16000); i < Math.round((at + 0.1) * 16000); i++)
      sum += samples.readFloatLE(i * 4) ** 2;
    return Math.sqrt(sum / 1600);
  };
  expect(rms(1.8)).toBeGreaterThan(rms(0.2) * 5);
});

it('renders long animation graphs through temporary scripts and cleans them afterwards', async () => {
  const edit = defaultSettings(asset),
    layer = insertedMediaLayer(edit, asset, photo, 0);
  layer.animation = {
    x: {
      interpolation: 'linear',
      keys: Array.from({ length: 100 }, (_, i) => ({ time: i * 0.03, value: i % 2 ? 10 : 0 })),
    },
  };
  edit.mediaLayers = [layer];
  const plan = buildExportArgs(asset, edit, input, join(dir, 'long-motion.mp4'), {
    ...resourcePaths(),
    media: { [layer.id]: picture },
  });
  const job = runFfmpeg(plan, 3, () => {});
  const script = job.child.spawnargs[job.child.spawnargs.indexOf('-filter_script:v') + 1];
  expect(script).toContain('frame-filters-');
  await job.done;
  const { existsSync } = await import('node:fs');
  expect(existsSync(script)).toBe(false);
});
