import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { seekPreviewClips } from '../src/core/preview-seeking';
import { effectPreviewRecipe } from '../src/core/effect-preview';
import { buildExportArgs } from '../src/core/export-plan';
import { resourcePaths } from '../src/core/resources';
import { defaultSettings, type MediaAsset } from '../src/core/types';
import { sourceIdentity } from '../src/core/project';
import { ffmpegPath, probeFile } from '../electron/native';
const exec = promisify(execFile);
let directory: string, input: string, asset: MediaAsset;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'frame-preview-seek-'));
  input = join(directory, 'colors.mp4');
  await exec(ffmpegPath(), [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=red:s=320x240:r=10:d=3',
    '-f',
    'lavfi',
    '-i',
    'color=blue:s=320x240:r=10:d=3',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=1000:duration=6',
    '-filter_complex',
    '[0:v][1:v]concat=n=2:v=1:a=0[v]',
    '-map',
    '[v]',
    '-map',
    '2:a',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-c:a',
    'aac',
    input,
  ]);
  asset = { ...(await probeFile(input)), id: 'colors', name: 'colors.mp4', previewUrl: '' };
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});
it('seeks reordered footage directly while preserving speed, audio mix input indices and output clocks', async () => {
  const layer = {
    id: 'audio',
    sourceId: asset.id,
    source: sourceIdentity(asset),
    start: 0,
    end: 2,
    sourceStart: 2,
    sourceEnd: 4,
    volume: 0.2,
    fadeIn: 0,
    fadeOut: 0,
    loop: false,
    muted: false,
  };
  const edit = effectPreviewRecipe(asset, {
    ...defaultSettings(asset),
    audioLayers: [layer],
    clips: [
      { id: 'late', start: 4, end: 6, effects: { speed: 2 } },
      { id: 'early', start: 0, end: 1, effects: { volume: 0.5 } },
    ],
  });
  const output = join(directory, 'seeked.mp4'),
    original = buildExportArgs(asset, edit, input, output, resourcePaths(), [
      { layer, path: input },
    ]),
    plan = seekPreviewClips(original, edit, input);
  expect(plan).not.toBe(original);
  expect(plan[plan.indexOf('-ss') + 1]).toBe('4');
  expect(plan[plan.indexOf('-filter_complex') + 1]).toContain('[1:a:0]');
  await exec(ffmpegPath(), plan);
  const result = await probeFile(output);
  expect(result.duration).toBeCloseTo(2, 1);
  expect(result.hasAudio).toBe(true);
  const pixel = async (time: number) =>
    (
      await exec(
        ffmpegPath(),
        [
          '-v',
          'error',
          '-ss',
          String(time),
          '-i',
          output,
          '-frames:v',
          '1',
          '-vf',
          'scale=1:1',
          '-f',
          'rawvideo',
          '-pix_fmt',
          'rgb24',
          '-',
        ],
        { encoding: 'buffer' },
      )
    ).stdout;
  const late = await pixel(0.5),
    early = await pixel(1.5);
  expect(late[2]).toBeGreaterThan(220);
  expect(late[0]).toBeLessThan(25);
  expect(early[0]).toBeGreaterThan(220);
  expect(early[2]).toBeLessThan(25);
});
it('bounds decoder count and leaves plans with an incompatible structure untouched', () => {
  const edit = effectPreviewRecipe(asset, {
    ...defaultSettings(asset),
    clips: Array.from({ length: 9 }, (_, i) => ({
      id: String(i),
      start: 0,
      end: 1,
      effects: {},
    })),
  });
  const plan = buildExportArgs(asset, edit, input, 'unused.mp4', resourcePaths());
  expect(seekPreviewClips(plan, edit, input)).toBe(plan);
  expect(seekPreviewClips(['-i', input, 'unused.mp4'], edit, input)).toEqual([
    '-i',
    input,
    'unused.mp4',
  ]);
});

it('seeks legacy cut ranges without changing their output order', async () => {
  const edit = effectPreviewRecipe(asset, {
    ...defaultSettings(asset),
    cuts: [{ start: 1, end: 4 }],
  });
  const output = join(directory, 'legacy.mp4');
  const plan = seekPreviewClips(
    buildExportArgs(asset, edit, input, output, resourcePaths()),
    edit,
    input,
  );
  await exec(ffmpegPath(), plan);
  expect((await probeFile(output)).duration).toBeCloseTo(3, 1);
});

it('keeps a forward contiguous read on a single decoder', () => {
  const edit = {
    ...defaultSettings(asset),
    clips: [
      { id: 'first', start: 0, end: 2, effects: { volume: 0.5 } },
      { id: 'second', start: 2, end: 4, effects: {} },
    ],
  };
  const plan = buildExportArgs(asset, edit, input, 'unused.mp4', resourcePaths());
  expect(seekPreviewClips(plan, edit, input)).toBe(plan);
});
