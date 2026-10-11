import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, type EditSettings, type MediaAsset } from '../src/core/types';
import { effectAction } from '../src/core/effect-actions';
import { clipEffectRows } from '../src/core/effect-timeline';
import { effectLibrary } from '../src/core/effect-library';
import { changeInstance, effectiveVolume } from '../src/core/effect-instances';
import { adjustmentIntervals, parseEffectRanges } from '../src/core/timed-adjustments';
import { splitClip, editClips, clipRecipe, patchClip } from '../src/core/clips';
import { parseEdit } from '../src/core/project';
import { buildExportArgs } from '../src/core/export-plan';
import { framePreviewArgs } from '../src/core/frame-preview';
import { buildMergeArgs } from '../src/core/composition';
import { outputSettings } from '../src/core/presets';
import { audioFilters, videoFilters } from '../src/core/filters';
import { ffmpegPath } from '../electron/native';
const exec = promisify(execFile),
  ffmpeg = ffmpegPath()!;
const asset: MediaAsset = {
  id: 'test',
  name: 'test.mp4',
  kind: 'video',
  hasAudio: true,
  duration: 6,
  size: 1,
  width: 640,
  height: 360,
  previewUrl: '',
};
it('adds, resets, removes and persists independent ranges without altering other effects', () => {
  let edit = defaultSettings(asset);
  for (const id of ['volume', 'equalizer', 'noise', 'color'] as const) {
    const effect = effectLibrary.find((e) => e.id === id)!;
    edit = { ...edit, ...effectAction(edit, asset, effect, null, 'add', 1) };
    expect(edit.effectRanges?.[id]).toEqual({ start: 0, end: 6 });
    edit = { ...edit, ...effectAction(edit, asset, effect, null, 'add', 2) };
    const instance = edit.effectInstances!.at(-1)!;
    expect(instance.range).toEqual({ start: 2, end: 4 });
    edit = { ...edit, ...changeInstance(edit, instance.id, null, {}, { start: 3, end: 5 }) };
    expect(
      parseEdit(JSON.parse(JSON.stringify(edit)), asset).effectInstances!.at(-1)!.range,
    ).toEqual({ start: 3, end: 5 });
    edit = { ...edit, ...effectAction(edit, asset, effect, null, 'reset') };
    expect(edit.effectRanges?.[id]).toEqual({ start: 0, end: 6 });
    edit = { ...edit, ...effectAction(edit, asset, effect, null, 'remove') };
    expect(edit.effectRanges?.[id]).toBeUndefined();
    expect(edit.effectInstances!.at(-1)!.range).toEqual({ start: 3, end: 5 });
  }
  for (const value of [
    { crop: { start: 1, end: 2 } },
    { volume: { start: -1, end: 2 } },
    { noise: { start: 2, end: 2 } },
    { color: { start: 0, end: Infinity } },
  ])
    expect(() => parseEffectRanges(value)).toThrow();
  expect(() =>
    parseEdit(
      {
        ...edit,
        effectInstances: [{ ...edit.effectInstances![0], effect: 'speed', settings: { speed: 1 } }],
      },
      asset,
    ),
  ).toThrow('independent time range');
});
it('groups independently added matching instances on different split clips in the same lane', () => {
  let edit = defaultSettings(asset);
  edit = { ...edit, ...splitClip(edit, editClips(edit)[0].id, 3) };
  const effect = effectLibrary.find((effect) => effect.id === 'volume')!;
  for (const clip of edit.clips!)
    for (let i = 0; i < 2; i++)
      edit = { ...edit, ...effectAction(edit, asset, effect, clip.id, 'add', clip.start) };
  const rows = clipEffectRows(asset, edit);
  expect(rows).toHaveLength(2);
  expect(rows.map((row) => row.items.map((item) => item.index))).toEqual([
    [0, 1],
    [0, 1],
  ]);
  expect(rows[1].items[0].instanceId).not.toBe(rows[1].items[1].instanceId);
  const second = clipRecipe(edit, edit.clips![1]).effectInstances![0];
  edit = {
    ...edit,
    ...changeInstance(
      edit,
      rows[1].items[0].instanceId!,
      edit.clips![0].id,
      {},
      { start: 1, end: 2 },
    ),
  };
  expect(clipRecipe(edit, edit.clips![1]).effectInstances![0]).toEqual(second);
});
it('maps source ranges through cuts, speed and reordered clips and keeps local overrides independent', () => {
  let edit: EditSettings = {
    ...defaultSettings(asset),
    start: 1,
    speed: 2,
    effectRanges: { volume: { start: 2, end: 5 } },
    volume: 0.5,
    cuts: [{ start: 3, end: 4 }],
  };
  expect(adjustmentIntervals(edit, edit.effectRanges!.volume!)).toEqual([
    { start: 0.5, end: 1 },
    { start: 1, end: 1.5 },
  ]);
  edit = {
    ...edit,
    ...splitClip({ ...edit, cuts: [] }, editClips({ ...edit, cuts: [] })[0].id, 3),
    cuts: [],
  };
  edit.clips!.reverse();
  expect(adjustmentIntervals(edit, edit.effectRanges!.volume!)).toEqual([
    { start: 0, end: 1 },
    { start: 2, end: 2.5 },
  ]);
  edit = {
    ...edit,
    ...patchClip(edit, edit.clips![0].id, { effectRanges: { volume: { start: 4, end: 5 } } }),
  };
  expect(clipRecipe(edit, edit.clips![1]).effectRanges?.volume).toEqual({ start: 2, end: 5 });
  expect(effectiveVolume(clipRecipe(edit, edit.clips![0]), 3.5)).toBe(1);
  expect(effectiveVolume(clipRecipe(edit, edit.clips![0]), 4.5)).toBe(0.5);
});
it('renders timed gain and cleanup with real FFmpeg, including overlap, cuts, split order and speed', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-timed-gain-'));
  try {
    const input = join(directory, 'tone.wav');
    await exec(ffmpeg, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=1000:sample_rate=48000:duration=6',
      '-c:a',
      'pcm_f32le',
      input,
    ]);
    const audio = { ...asset, kind: 'audio' as const },
      base = { ...defaultSettings(audio), format: 'wav' as const, wavDepth: 32 as const };
    const edit: EditSettings = {
      ...base,
      volume: 0.5,
      effectRanges: { volume: { start: 1, end: 4 } },
      effectInstances: [
        {
          id: 'gain-two',
          effect: 'volume',
          range: { start: 2, end: 3 },
          settings: { volume: 0.4 },
        },
      ],
    };
    async function energies(recipe: EditSettings, name: string) {
      const path = join(directory, `${name}.wav`);
      await exec(ffmpeg, buildExportArgs(audio, recipe, input, path));
      const { stdout } = await exec(
        ffmpeg,
        ['-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', '48000', '-'],
        { encoding: 'buffer', maxBuffer: 3_000_000 },
      );
      return (time: number) => {
        let energy = 0;
        for (let i = Math.round((time + 0.1) * 48000); i < Math.round((time + 0.4) * 48000); i++)
          energy += stdout.readFloatLE(i * 4) ** 2;
        return energy;
      };
    }
    const normal = await energies(base, 'baseline'),
      gained = await energies(edit, 'timed');
    for (const [time, ratio] of [
      [0, 1],
      [1, 0.25],
      [2, 0.04],
      [3, 0.25],
      [4, 1],
    ])
      expect(gained(time) / normal(time)).toBeCloseTo(ratio, 3);
    const ordered = { ...edit, ...splitClip(edit, editClips(edit)[0].id, 3) };
    ordered.clips!.reverse();
    ordered.clips![0].effects.speed = 2;
    const reordered = await energies(ordered, 'ordered');
    expect(reordered(0) / normal(0)).toBeCloseTo(0.25, 2);
    expect(reordered(1) / normal(1)).toBeCloseTo(1, 2);
    expect(reordered(3.5) / normal(3.5)).toBeCloseTo(0.04, 2);
    const cleanup = {
      ...base,
      reduceNoise: true,
      equalizer: { bass: 3, mid: 6, treble: -2 },
      effectRanges: { noise: { start: 1, end: 2 }, equalizer: { start: 2, end: 3 } },
    };
    expect(audioFilters(cleanup).filter((filter) => filter.includes('enable='))).toHaveLength(4);
    const cleaned = await energies(cleanup, 'cleanup');
    expect(cleaned(4) / normal(4)).toBeCloseTo(1, 2);
    expect(cleaned(2) / normal(2)).toBeGreaterThan(3);
    const cut = await energies({ ...edit, cuts: [{ start: 1.5, end: 2.5 }] }, 'cut');
    expect(cut(1) / normal(1)).toBeCloseTo(0.25, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
it('renders timed color in exports, reordered clips, merges and processed frame previews', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-timed-color-'));
  try {
    const input = join(directory, 'grey.mp4');
    await exec(ffmpeg, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=gray:s=640x360:r=10:d=6',
      '-c:v',
      'libx264',
      '-threads',
      '1',
      input,
    ]);
    const video = { ...asset, hasAudio: false };
    let edit: EditSettings = {
      ...defaultSettings(video),
      color: { ...defaultSettings(video).color, brightness: 0.2 },
      effectRanges: { color: { start: 1, end: 2 } },
      effectInstances: [
        {
          id: 'look-two',
          effect: 'color',
          range: { start: 2, end: 3 },
          settings: { color: { ...defaultSettings(video).color, brightness: -0.2 } },
        },
      ],
    };
    async function pixel(path: string, time: number) {
      const { stdout } = await exec(
        ffmpeg,
        [
          '-v',
          'error',
          '-ss',
          String(time),
          '-i',
          path,
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
      );
      return stdout[0];
    }
    const output = join(directory, 'timed.mp4');
    await exec(ffmpeg, buildExportArgs(video, edit, input, output));
    const neutral = await pixel(output, 0.5);
    expect(await pixel(output, 1.5)).toBeGreaterThan(neutral + 40);
    expect(await pixel(output, 2.5)).toBeLessThan(neutral - 40);
    expect(await pixel(output, 3.5)).toBeCloseTo(neutral, 0);
    edit = { ...edit, ...splitClip(edit, editClips(edit)[0].id, 3) };
    edit.clips!.reverse();
    edit.clips![1].effects.speed = 2;
    const ordered = join(directory, 'ordered.mp4');
    await exec(ffmpeg, buildExportArgs(video, edit, input, ordered));
    expect(await pixel(ordered, 3.7)).toBeGreaterThan(neutral + 40);
    const merged = join(directory, 'merged.mp4');
    await exec(
      ffmpeg,
      buildMergeArgs(
        [
          { asset: video, edit },
          { asset: video, edit },
        ],
        outputSettings(edit),
        [input, input],
        merged,
      ),
    );
    expect(await pixel(merged, 8.2)).toBeGreaterThan(neutral + 40);
    const preview = join(directory, 'preview.png');
    await exec(ffmpeg, framePreviewArgs(video, edit, 1.5, input, preview));
    expect(await pixel(preview, 0)).toBeGreaterThan(neutral + 40);
    edit.effectInstances!.push({ id: 'legacy-speed', effect: 'speed', settings: { speed: 2 } });
    await exec(ffmpeg, framePreviewArgs(video, edit, 1.5, input, preview));
    expect(await pixel(preview, 0)).toBeGreaterThan(neutral + 40);
    const padded = {
      ...defaultSettings(video),
      color: { ...defaultSettings(video).color, brightness: 0.2 },
      effectRanges: { color: { start: 1, end: 2 } },
      effectInstances: [
        {
          id: 'legacy-pad',
          effect: 'transform' as const,
          settings: {
            geometry: {
              ...defaultSettings(video).geometry,
              resize: { width: 640, height: 640, fit: 'contain' as const },
            },
          },
        },
      ],
    };
    await exec(ffmpeg, framePreviewArgs(video, padded, 1.5, input, preview));
    const { stdout } = await exec(
      ffmpeg,
      ['-v', 'error', '-i', preview, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
      { encoding: 'buffer', maxBuffer: 2_000_000 },
    );
    expect(stdout[(5 * 640 + 320) * 3]).toBeLessThan(5);
    expect(stdout[(320 * 640 + 320) * 3]).toBeGreaterThan(neutral + 40);
    expect(
      videoFilters(video, { ...edit, clips: undefined }).filter((filter) =>
        filter.includes('enable='),
      ),
    ).toHaveLength(2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
