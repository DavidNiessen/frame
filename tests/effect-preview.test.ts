import { afterAll, beforeAll, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  audioPreviewAsset,
  effectPreviewArgs,
  effectPreviewNeeds,
  effectPreviewRanges,
  effectPreviewRecipe,
  needsEffectPreview,
} from '../src/core/effect-preview';
import { defaultSettings, type MediaAsset } from '../src/core/types';
import { resourcePaths, recipeFiles } from '../src/core/resources';
import { applyPreviewEffects } from '../src/hooks/usePreviewEffects';
import {
  configurePreviewClock,
  previewMediaTime,
  previewSourceTime,
} from '../src/core/preview-clock';
import { ffmpegPath, probeFile } from '../electron/native';
import type { AudioLayer } from '../src/core/audio-layers';
import { sourceIdentity } from '../src/core/project';
import { insertedMediaLayer, type MediaLayer } from '../src/core/media-layers';
import { liveMediaLayers } from '../src/core/live-media-layers';
const exec = promisify(execFile);
let directory: string, tone: string, audio: MediaAsset;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'frame-effects-preview-test-'));
  tone = join(directory, 'tone.wav');
  await exec(ffmpegPath(), [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=1000:duration=4',
    '-ac',
    '2',
    tone,
  ]);
  audio = { ...(await probeFile(tone)), id: 'tone', name: 'tone.wav', previewUrl: '' };
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});
it('uses rendered output time through cuts and different local speeds without applying gain or tempo twice', () => {
  const edit = {
    ...defaultSettings(audio),
    volume: 0.5,
    clips: [
      { id: 'a', start: 0, end: 1, effects: { speed: 0.5 } },
      { id: 'b', start: 2, end: 4, effects: { speed: 2 } },
    ],
  };
  const ranges = effectPreviewRanges(edit);
  expect(previewSourceTime(ranges, 2)).toBe(2);
  expect(previewSourceTime(ranges, 2.5)).toBe(3);
  expect(previewMediaTime(ranges, 3)).toBe(2.5);
  const media = {
    currentTime: 2.5,
    playbackRate: 2,
    volume: 0.5,
    tagName: 'AUDIO',
    dataset: { previewEffects: 'rendered' },
    style: {},
  } as unknown as HTMLMediaElement;
  configurePreviewClock(media, ranges);
  applyPreviewEffects(media, edit);
  expect(media.playbackRate).toBe(1);
  expect(media.volume).toBe(1);
});
it('does not regenerate rendered audio/color when interactive frame objects, geometry or delivery settings change', () => {
  const video = { ...audio, kind: 'video' as const, width: 640, height: 360 },
    edit = { ...defaultSettings(video), equalizer: { bass: 0, mid: 6, treble: 0 } };
  expect(needsEffectPreview(defaultSettings(video))).toBe(false);
  expect(needsEffectPreview(edit)).toBe(true);
  const changed = {
    ...edit,
    crop: { x: 10, y: 10, width: 100, height: 100 },
    overlays: { ...edit.overlays, text: 'Editable' },
    quality: 'high' as const,
    videoBitrate: 10000,
    format: 'gif' as const,
  };
  expect(effectPreviewRecipe(video, changed)).toEqual(effectPreviewRecipe(video, edit));
  expect(
    needsEffectPreview({ ...defaultSettings(video), color: { ...edit.color, temperature: 0.5 } }),
  ).toBe(true);
  expect(needsEffectPreview({ ...defaultSettings(video), reduceNoise: true })).toBe(true);
  expect(needsEffectPreview({ ...defaultSettings(video), normalizeLoudness: true })).toBe(true);
});
it('renders audible EQ only inside its output interval and includes one copy of the base gain', async () => {
  const edit = effectPreviewRecipe(audio, {
    ...defaultSettings(audio),
    volume: 0.5,
    effectInstances: [
      {
        id: 'eq',
        effect: 'equalizer',
        timeSpace: 'output',
        range: { start: 0, end: 2 },
        settings: { equalizer: { bass: 0, mid: -12, treble: 0 } },
      },
    ],
  });
  const output = join(directory, 'processed.mp3');
  await exec(ffmpegPath(), effectPreviewArgs(audio, edit, tone, output, resourcePaths()), {
    env: { ...process.env, PATH: '' },
  });
  const rms = async (path: string, start: number) => {
    const { stdout } = await exec(
      ffmpegPath(),
      [
        '-v',
        'error',
        '-ss',
        String(start),
        '-i',
        path,
        '-t',
        '0.5',
        '-ac',
        '1',
        '-ar',
        '48000',
        '-f',
        'f32le',
        '-',
      ],
      { encoding: 'buffer' },
    );
    let sum = 0;
    for (let i = 0; i < stdout.length; i += 4) sum += stdout.readFloatLE(i) ** 2;
    return Math.sqrt(sum / (stdout.length / 4));
  };
  const reference = join(directory, 'reference.mp3');
  await exec(
    ffmpegPath(),
    effectPreviewArgs(
      audio,
      effectPreviewRecipe(audio, defaultSettings(audio)),
      tone,
      reference,
      resourcePaths(),
    ),
  );
  const original = await rms(reference, 0.5);
  expect((await rms(output, 0.5)) / original).toBeCloseTo(0.5 * 10 ** (-12 / 20), 2);
  // MP3 encoding has a small level tolerance; doubling gain would be far outside it.
  expect((await rms(output, 2.5)) / original).toBeGreaterThan(0.48);
  expect((await rms(output, 2.5)) / original).toBeLessThan(0.52);
  expect((await probeFile(output)).duration).toBeCloseTo(4, 1);
});
it('renders a real LUT and temperature on a reordered/speed-adjusted lightweight video', async () => {
  const input = resolve('tests/fixtures/sample.mp4'),
    video = { ...(await probeFile(input)), id: 'video', name: 'sample.mp4', previewUrl: '' };
  const lut = 'LUT_3D_SIZE 2\n' + Array(8).fill('1 0 0').join('\n') + '\n';
  const edit = effectPreviewRecipe(video, {
    ...defaultSettings(video),
    color: { ...defaultSettings(video).color, temperature: 0.5, lut, lutName: 'red.cube' },
    clips: [
      { id: 'a', start: 4, end: 6, effects: { speed: 2 } },
      { id: 'b', start: 0, end: 2, effects: {} },
    ],
  });
  const paths = resourcePaths(join(directory, 'color')),
    output = join(directory, 'processed.mp4');
  for (const file of recipeFiles(edit, paths, video)) await writeFile(file.path, file.text);
  await exec(ffmpegPath(), effectPreviewArgs(video, edit, input, output, paths));
  const prepared = await probeFile(output);
  expect(prepared.duration).toBeCloseTo(3, 1);
  expect(prepared.width).toBeLessThanOrEqual(720);
  const { stdout } = await exec(
    ffmpegPath(),
    [
      '-v',
      'error',
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
  );
  expect(stdout[0]).toBeGreaterThan(220);
  expect(stdout[1]).toBeLessThan(25);
  expect(stdout[2]).toBeLessThan(25);
});

it('prepares video with audio-only corrections and a mixed audio graph even when no video filters exist', async () => {
  const input = resolve('tests/fixtures/sample.mp4'),
    video = { ...(await probeFile(input)), id: 'video', name: 'sample.mp4', previewUrl: '' };
  const layer = {
    id: 'layer',
    sourceId: audio.id,
    source: audio,
    start: 0,
    end: 4,
    sourceStart: 0,
    sourceEnd: 4,
    volume: 0.5,
    fadeIn: 0,
    fadeOut: 0,
    loop: false,
    muted: false,
  };
  for (const [index, edit] of [
    { ...defaultSettings(video), equalizer: { bass: -6, mid: 0, treble: 0 } },
    { ...defaultSettings(video), audioLayers: [layer] },
  ].entries()) {
    const recipe = effectPreviewRecipe(video, edit),
      output = join(directory, `audio-only-${index}.mp4`);
    await exec(
      ffmpegPath(),
      effectPreviewArgs(
        video,
        recipe,
        input,
        output,
        resourcePaths(),
        index ? [{ layer, path: tone }] : [],
      ),
    );
    const preview = await probeFile(output);
    expect(preview.kind).toBe('video');
    expect(preview.hasAudio).toBe(true);
    expect(preview.duration).toBeCloseTo(video.duration, 1);
  }
});

it('keeps simple splits out of the render key while preserving independent clip fades', () => {
  const video = { ...audio, kind: 'video' as const, width: 640, height: 360 };
  const edit = {
    ...defaultSettings(video),
    splits: [1, 2],
    clips: [
      { id: 'a', start: 0, end: 2, effects: {} },
      { id: 'b', start: 2, end: 4, effects: {} },
    ],
  };
  const recipe = effectPreviewRecipe(video, edit);
  expect(recipe.clips).toHaveLength(1);
  expect(recipe.clips![0]).toMatchObject({ start: 0, end: 4 });
  expect(recipe.splits).toEqual([]);
  expect(edit.clips).toHaveLength(2);
  expect(
    effectPreviewRecipe(video, {
      ...edit,
      clips: edit.clips.map((clip) => ({ ...clip, effects: { audioFadeOut: 0.2 } })),
    }).clips,
  ).toHaveLength(2);
});

it('processes real high-resolution color at preview resolution for simple, cut and ordered sequences', async () => {
  const input = join(directory, 'large.mp4');
  await exec(ffmpegPath(), [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=red:s=1920x1080:r=10:d=2',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    input,
  ]);
  const video = { ...(await probeFile(input)), id: 'large', name: 'large.mp4', previewUrl: '' };
  const base = {
    ...defaultSettings(video),
    color: { ...defaultSettings(video).color, brightness: -0.1 },
  };
  const edits = [
    base,
    { ...base, cuts: [{ start: 0.5, end: 1 }] },
    {
      ...base,
      clips: [
        { id: 'first', start: 1, end: 2, effects: {} },
        { id: 'second', start: 0, end: 0.5, effects: {} },
      ],
    },
  ];
  for (const [index, edit] of edits.entries()) {
    const plan = effectPreviewArgs(
      video,
      effectPreviewRecipe(video, edit),
      input,
      join(directory, `large-preview-${index}.mp4`),
      resourcePaths(),
    );
    await exec(ffmpegPath(), plan);
    const rendered = await probeFile(plan.at(-1)!);
    expect(rendered.width).toBe(720);
    expect(rendered.height).toBeLessThanOrEqual(406);
    expect(rendered.duration).toBeCloseTo(index ? 1.5 : 2, 1);
    const { stdout } = await exec(
      ffmpegPath(),
      [
        '-v',
        'error',
        '-i',
        plan.at(-1)!,
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
    expect(stdout[0]).toBeGreaterThan(150);
    expect(stdout[1]).toBeLessThan(15);
  }
});
it('separates audio-only corrections from renders the picture needs', () => {
  const video = { ...audio, kind: 'video' as const, width: 640, height: 360, hasAudio: true },
    base = defaultSettings(video),
    warm = { ...base, color: { ...base.color, temperature: 0.5 } };
  expect(effectPreviewNeeds({ ...base, reduceNoise: true }, true, true)).toEqual({
    audio: true,
    video: false,
  });
  expect(effectPreviewNeeds(warm, true, false)).toEqual({ audio: false, video: true });
  expect(effectPreviewNeeds(warm, true, true)).toEqual({ audio: false, video: false });
  expect(
    effectPreviewNeeds(
      {
        ...base,
        clips: [{ id: 'a', start: 0, end: 2, effects: { normalizeLoudness: true } }],
      },
      true,
      true,
    ),
  ).toEqual({ audio: true, video: false });
  // Live grading keeps the soundtrack render independent of color changes.
  expect(
    effectPreviewRecipe(audioPreviewAsset(video), { ...warm, reduceNoise: true }, true),
  ).toEqual(effectPreviewRecipe(audioPreviewAsset(video), { ...base, reduceNoise: true }, true));
});
it('renders only the soundtrack of a cut, speed-adjusted video and mixes audio tracks over silent video', async () => {
  const source = join(directory, 'clip.mp4'),
    silent = join(directory, 'silent.mp4');
  await exec(ffmpegPath(), [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=30:duration=4',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=4',
    '-shortest',
    '-pix_fmt',
    'yuv420p',
    source,
  ]);
  await exec(ffmpegPath(), [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=30:duration=4',
    '-pix_fmt',
    'yuv420p',
    silent,
  ]);
  const probe = async (path: string) =>
    (
      await exec(ffmpegPath(), ['-hide_banner', '-i', path], { encoding: 'utf8' }).catch(
        (error: { stderr: string }) => error,
      )
    ).stderr;
  const video = { ...(await probeFile(source)), id: 'clip', name: 'clip.mp4', previewUrl: '' },
    asset = audioPreviewAsset(video),
    edit = effectPreviewRecipe(
      asset,
      {
        ...defaultSettings(video),
        reduceNoise: true,
        clips: [
          { id: 'a', start: 0, end: 1, effects: {} },
          { id: 'b', start: 2, end: 4, effects: { speed: 2 } },
        ],
      },
      true,
    );
  expect(edit.format).toBe('mp3');
  const output = join(directory, 'soundtrack.mp3');
  await exec(ffmpegPath(), effectPreviewArgs(asset, edit, source, output, resourcePaths()));
  const info = await probe(output);
  expect(info).toMatch(/Audio: mp3/);
  expect(info).not.toMatch(/Video:/);
  const [, minutes, seconds] = /Duration: 00:(\d+):([\d.]+)/.exec(info)!;
  expect(Number(minutes) * 60 + Number(seconds)).toBeCloseTo(2, 0);

  const quiet = { ...(await probeFile(silent)), id: 'silent', name: 'silent.mp4', previewUrl: '' },
    layer: AudioLayer = {
      id: 'music',
      source: sourceIdentity(audio),
      start: 0,
      end: 3,
      sourceStart: 0,
      sourceEnd: 3,
      volume: 1,
      muted: false,
      loop: false,
      fadeIn: 0,
      fadeOut: 0,
    };
  const mixed = effectPreviewRecipe(
      audioPreviewAsset(quiet),
      { ...defaultSettings(quiet), audioLayers: [layer] },
      true,
    ),
    track = join(directory, 'track.mp3');
  await exec(
    ffmpegPath(),
    effectPreviewArgs(audioPreviewAsset(quiet), mixed, silent, track, resourcePaths(), [
      { layer, path: tone },
    ]),
  );
  expect(await probe(track)).toMatch(/Audio: mp3/);
});
it('leaves media layers over a simply cropped base to the live compositor and renders only their audio', () => {
  const video = { ...audio, kind: 'video' as const, width: 640, height: 360, hasAudio: true },
    overlay = { ...video, id: 'overlay', name: 'overlay.mp4', previewUrl: 'blob:overlay' },
    layer: MediaLayer = {
      ...insertedMediaLayer(defaultSettings(video), video, overlay, 0),
      id: 'layer',
    },
    edit = { ...defaultSettings(video), mediaLayers: [layer] };
  expect(liveMediaLayers(video, edit, [video, overlay], true)).toBe(true);
  expect(liveMediaLayers(video, edit, [video, overlay], false)).toBe(false);
  expect(liveMediaLayers(video, edit, [video], true)).toBe(false);
  expect(
    liveMediaLayers(
      video,
      { ...edit, crop: { x: 0, y: 0, width: 320, height: 180 } },
      [video, overlay],
      true,
    ),
  ).toBe(true);
  expect(
    liveMediaLayers(
      video,
      { ...edit, geometry: { ...edit.geometry, rotation: 90 } },
      [video, overlay],
      true,
    ),
  ).toBe(false);
  expect(effectPreviewNeeds(edit, true, true, true)).toEqual({ audio: false, video: false });
  expect(effectPreviewNeeds(edit, true, true, false).video).toBe(true);
  expect(effectPreviewRecipe(video, edit, true, true).mediaLayers).toBeUndefined();
  expect(effectPreviewRecipe(audioPreviewAsset(video), edit, true).mediaLayers).toBeUndefined();
});
