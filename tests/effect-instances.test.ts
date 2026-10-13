import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { effectAction, clearClipEffects, existingEffectTarget } from '../src/core/effect-actions';
import { effectLibrary, type EffectId } from '../src/core/effect-library';
import {
  definitionFor,
  changeInstance,
  extraInstances,
  instanceRecipe,
  allAudioLayers,
  newInstance,
} from '../src/core/effect-instances';
import { defaultSettings, type EditSettings, type MediaAsset } from '../src/core/types';
import { createProject, parseEdit, sourceIdentity } from '../src/core/project';
import { clipRecipe, editClips, splitClip, patchClip } from '../src/core/clips';
import { editedDuration } from '../src/core/timeline';
import { captionItems, changeCaption } from '../src/core/caption-items';
import { outputCues } from '../src/core/subtitles';
import { buildExportArgs } from '../src/core/export-plan';
import { embeddedCues, recipeFiles, recipeImages, resourcePaths } from '../src/core/resources';
import { mergedCues } from '../src/core/composition';
import { audioFilters } from '../src/core/filters';
import { resolveAudioLayers } from '../src/core/audio-layers';
import { ffmpegPath, probeFile } from '../electron/native';
const exec = promisify(execFile),
  ffmpeg = ffmpegPath()!;
const asset: MediaAsset = {
  id: 'sample',
  name: 'sample.mp4',
  size: 1,
  duration: 6,
  kind: 'video',
  hasAudio: true,
  width: 640,
  height: 360,
  previewUrl: '',
};
// Older saved projects may contain stacks that the current catalogue no longer creates.
const legacyAdd = (
  edit: EditSettings,
  id: string,
  selectedClip: string | null = null,
  current?: number,
): EditSettings => {
  const effect = definitionFor(id as EffectId);
  if (!existingEffectTarget(edit, asset, effect, selectedClip))
    return { ...edit, ...effectAction(edit, asset, effect, selectedClip, 'add', current) };
  const clip =
      effect.scope === 'clip' ? edit.clips?.find((clip) => clip.id === selectedClip) : undefined,
    recipe = clip ? clipRecipe(edit, clip) : edit;
  const effectInstances = [
    ...extraInstances(recipe),
    newInstance(recipe, asset, effect.id, undefined, current),
  ];
  return {
    ...edit,
    ...(clip ? patchClip(edit, clip.id, { effectInstances }) : { effectInstances }),
  };
};
it('preserves independent, persistable parameters in legacy effect stacks', () => {
  for (const effect of effectLibrary.filter(
    (effect) => !effect.mediaKinds || effect.mediaKinds.includes(asset.kind),
  )) {
    let edit = legacyAdd(legacyAdd(defaultSettings(asset), effect.id), effect.id);
    expect(extraInstances(edit, effect.id)).toHaveLength(1);
    const instance = extraInstances(edit)[0];
    expect(instanceRecipe(edit, instance).effectInstances).toBeUndefined();
    edit = parseEdit(JSON.parse(JSON.stringify(edit)), asset);
    expect(extraInstances(edit)[0]).toEqual(instance);
    edit = { ...edit, ...effectAction(edit, asset, effect, null, 'remove') };
    expect(extraInstances(edit)).toEqual([instance]);
    edit = { ...edit, ...changeInstance(edit, instance.id, null, 'remove') };
    expect(extraInstances(edit)).toEqual([]);
  }
});
it('keeps repeated clip settings independent through split, shared changes and removal', () => {
  let edit = legacyAdd(legacyAdd(defaultSettings(asset), 'volume'), 'volume');
  const id = extraInstances(edit)[0].id;
  edit = { ...edit, volume: 0.5, ...changeInstance(edit, id, null, { volume: 0.4 }) };
  edit = { ...edit, ...splitClip(edit, editClips(edit)[0].id, 3) };
  const second = edit.clips![1].id;
  edit = { ...edit, ...changeInstance(edit, id, second, { volume: 0.8 }) };
  expect(
    instanceRecipe(
      clipRecipe(edit, edit.clips![0]),
      extraInstances(clipRecipe(edit, edit.clips![0]))[0],
    ).volume,
  ).toBe(0.4);
  expect(
    instanceRecipe(
      clipRecipe(edit, edit.clips![1]),
      extraInstances(clipRecipe(edit, edit.clips![1]))[0],
    ).volume,
  ).toBe(0.8);
  edit = { ...edit, ...changeInstance(edit, id, null, { volume: 0.2 }) };
  expect(
    edit.clips!.map((clip) => extraInstances(clipRecipe(edit, clip))[0].settings.volume),
  ).toEqual([0.2, 0.2]);
  edit = { ...edit, ...clearClipEffects(edit, asset, second) };
  expect(extraInstances(clipRecipe(edit, edit.clips![1]))).toEqual([]);
  expect(extraInstances(clipRecipe(edit, edit.clips![0]))).toHaveLength(1);
});
it('adds captions at the playhead and updates one owner without changing the other', () => {
  let edit = legacyAdd(legacyAdd(defaultSettings(asset), 'captions', null, 1), 'captions', null, 3);
  const items = captionItems(edit);
  expect(items.map((item) => item.start)).toEqual([1, 3]);
  edit = {
    ...edit,
    ...changeCaption(edit, items[1], { text: 'Second', position: { x: 25, y: 50 } }),
  };
  expect(edit.subtitles.cues[0].text).toBe('New caption');
  expect(captionItems(edit)[1].text).toBe('Second');
  edit = { ...edit, ...changeCaption(edit, captionItems(edit)[0], 'remove') };
  expect(captionItems(edit).map((item) => item.text)).toEqual(['Second']);
});
it('maps captions and split durations through the product of independent speed effects', () => {
  let edit = legacyAdd(legacyAdd(defaultSettings(asset), 'speed'), 'speed');
  edit = {
    ...edit,
    speed: 2,
    ...changeInstance(edit, extraInstances(edit)[0].id, null, { speed: 0.5 }),
  };
  edit = legacyAdd(edit, 'captions', null, 2);
  expect(editedDuration(edit)).toBe(6);
  expect(outputCues(edit)[0].start).toBe(2);
  edit = { ...edit, ...splitClip(edit, editClips(edit)[0].id, 3) };
  expect(editedDuration(edit)).toBe(6);
  expect(parseEdit(JSON.parse(JSON.stringify(edit)), asset)).toEqual(edit);
});
it('rejects nested stacks, unknown parameters, duplicate IDs and unsafe identifiers', () => {
  const edit = legacyAdd(legacyAdd(defaultSettings(asset), 'volume'), 'volume'),
    instance = extraInstances(edit)[0];
  for (const effectInstances of [
    [{ ...instance, id: '../bad' }],
    [instance, instance],
    [{ ...instance, settings: { crop: null } }],
    [{ ...instance, settings: { effectInstances: [] } }],
  ])
    expect(() => parseEdit({ ...edit, effectInstances }, asset)).toThrow();
});
it('retains portable source references for repeated music groups', () => {
  let edit = legacyAdd(legacyAdd(defaultSettings(asset), 'mix'), 'mix');
  const layer = {
    id: 'music-one',
    sourceId: asset.id,
    source: sourceIdentity(asset),
    start: 0,
    end: 3,
    sourceStart: 0,
    sourceEnd: 3,
    volume: 0.5,
    fadeIn: 0,
    fadeOut: 0,
    loop: false,
    muted: false,
  };
  edit.audioLayers = [layer];
  edit = {
    ...edit,
    ...changeInstance(edit, extraInstances(edit)[0].id, null, {
      audioLayers: [{ ...layer, id: 'music-two' }],
    }),
  };
  const portable = createProject('mix', [asset], () => edit, asset.id).sources[0].edit;
  expect(allAudioLayers(portable).map((layer) => layer.sourceIndex)).toEqual([0, 0]);
  expect(resolveAudioLayers(edit, [{ asset, path: 'source' }])).toHaveLength(2);
});
async function render(edit: EditSettings, directory: string, name: string) {
  const paths = {
    ...resourcePaths(join(directory, name), edit.subtitles.mode),
    fonts: resolve('public/fonts'),
  };
  for (const file of recipeFiles(edit, paths, asset)) await writeFile(file.path, file.text);
  for (const image of recipeImages(edit, paths))
    await writeFile(image.path, Buffer.from(image.data.split(',')[1], 'base64'));
  const output = join(directory, `${name}.${edit.format}`);
  await exec(
    ffmpeg,
    buildExportArgs(asset, edit, resolve('tests/fixtures/sample.mp4'), output, paths),
  );
  return output;
}
it('renders stacked gain, cleanup, color and transforms through real FFmpeg', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-stack-'));
  try {
    let edit: EditSettings = {
      ...defaultSettings(asset),
      end: 1,
      format: 'wav',
      wavDepth: 32,
      volume: 0.5,
    };
    edit = legacyAdd(edit, 'volume');
    const id = extraInstances(edit)[0].id;
    edit = { ...edit, ...changeInstance(edit, id, null, { volume: 0.5 }) };
    const output = await render(edit, directory, 'quarter');
    const original = await render({ ...edit, effectInstances: [] }, directory, 'half');
    async function samples(path: string) {
      const { stdout } = await exec(ffmpeg, ['-v', 'error', '-i', path, '-f', 'f32le', '-'], {
        encoding: 'buffer',
        maxBuffer: 3_000_000,
      });
      return Array.from({ length: stdout.length / 4 }, (_, i) => stdout.readFloatLE(i * 4));
    }
    const half = await samples(original),
      quarter = await samples(output);
    const energy = (values: number[]) => values.reduce((sum, value) => sum + value * value, 0);
    expect(energy(quarter) / energy(half)).toBeCloseTo(0.25, 3);
    let video = { ...defaultSettings(asset), end: 1 };
    for (const effect of ['noise', 'equalizer', 'normalize', 'color', 'transform'])
      video = legacyAdd(legacyAdd(video, effect), effect);
    video.geometry.rotation = 90;
    for (const instance of extraInstances(video))
      video = {
        ...video,
        ...changeInstance(
          video,
          instance.id,
          null,
          instance.effect === 'transform'
            ? { geometry: { ...video.geometry, rotation: 90 } }
            : instance.effect === 'color'
              ? { color: { ...video.color, brightness: 0.1 } }
              : instance.effect === 'equalizer'
                ? { equalizer: { bass: 2, mid: -1, treble: 1 } }
                : {},
        ),
      };
    expect(audioFilters(video).filter((filter) => filter.startsWith('afftdn'))).toHaveLength(2);
    const result = await probeFile(await render(video, directory, 'processed'));
    expect([result.width, result.height]).toEqual([640, 360]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
it('exports independent burned and embedded captions after splitting and speed changes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-captions-stack-'));
  try {
    let edit = legacyAdd(
      legacyAdd(defaultSettings(asset), 'captions', null, 0),
      'captions',
      null,
      1,
    );
    edit.end = 3;
    edit.speed = 2;
    edit.subtitles.cues[0].text = 'BURNED';
    edit = {
      ...edit,
      ...changeInstance(edit, extraInstances(edit, 'captions')[0].id, null, {
        subtitles: { mode: 'embed', cues: [{ start: 1, end: 3, text: 'SELECTABLE' }] },
      }),
    };
    edit = { ...edit, ...splitClip(edit, editClips(edit)[0].id, 1.5) };
    expect(embeddedCues(edit).map((cue) => [cue.start, cue.end])).toEqual([
      [0.5, 0.75],
      [0.75, 1.5],
    ]);
    expect(
      mergedCues([
        { asset, edit },
        { asset, edit },
      ]).map((cue) => cue.start),
    ).toEqual([0.5, 0.75, 2, 2.25]);
    const output = await render(edit, directory, 'captions');
    const { stdout } = await exec(ffmpeg, [
      '-v',
      'error',
      '-i',
      output,
      '-map',
      '0:s:0',
      '-f',
      'srt',
      '-',
    ]);
    expect(stdout).toContain('SELECTABLE');
    expect(stdout).not.toContain('BURNED');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
it('renders two independent PNG watermarks and LUT resources after joining clips', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-watermark-stack-'));
  try {
    let edit = legacyAdd(legacyAdd(defaultSettings(asset), 'watermark'), 'watermark');
    edit.end = 1;
    const images: string[] = [];
    for (const color of ['red', 'lime']) {
      const path = join(directory, `${color}.png`);
      await exec(ffmpeg, [
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=${color}:s=64x64`,
        '-frames:v',
        '1',
        '-threads',
        '1',
        path,
      ]);
      images.push(`data:image/png;base64,${(await readFile(path)).toString('base64')}`);
    }
    edit.overlays = { ...edit.overlays, image: images[0], x: 10, y: 25 };
    edit = {
      ...edit,
      ...changeInstance(edit, extraInstances(edit, 'watermark')[0].id, null, {
        overlays: { ...edit.overlays, image: images[1], x: 90, y: 75 },
      }),
    };
    // Two identity LUTs must have distinct generated files, including per-clip copies.
    const lut = `LUT_3D_SIZE 2\n${[0, 1].flatMap((b) => [0, 1].flatMap((g) => [0, 1].map((r) => `${r} ${g} ${b}`))).join('\n')}\n`;
    edit.crop = { x: 0, y: 0, width: 320, height: 180 };
    edit = legacyAdd(legacyAdd(edit, 'color'), 'color');
    edit.color = { ...edit.color, lut, lutName: 'first.cube' };
    edit = {
      ...edit,
      ...changeInstance(edit, extraInstances(edit, 'color')[0].id, null, {
        color: { ...edit.color, lutName: 'second.cube' },
      }),
    };
    edit = { ...edit, ...splitClip(edit, editClips(edit)[0].id, 0.5) };
    expect(buildExportArgs(asset, edit, 'input', 'output').join(' ')).toContain('scale=64:-1');
    const output = await render(edit, directory, 'watermarks');
    const { stdout } = await exec(
      ffmpeg,
      ['-v', 'error', '-i', output, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
      { encoding: 'buffer', maxBuffer: 2_000_000 },
    );
    const pixel = (x: number, y: number) =>
      Array.from(stdout.subarray((y * 320 + x) * 3, (y * 320 + x) * 3 + 3));
    expect(pixel(58, 61)[0]).toBeGreaterThan(200);
    expect(pixel(58, 61)[1]).toBeLessThan(50);
    expect(pixel(262, 119)[1]).toBeGreaterThan(200);
    expect(pixel(262, 119)[0]).toBeLessThan(50);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
it('keeps shared repeated fades at output edges and validates the actual picture entering a repeated crop', () => {
  let edit = legacyAdd(legacyAdd(defaultSettings(asset), 'audioFadeOut'), 'audioFadeOut');
  edit = { ...edit, speed: 2, ...splitClip(edit, editClips(edit)[0].id, 3) };
  edit = {
    ...edit,
    ...changeInstance(edit, extraInstances(edit)[0].id, null, { audioFadeOut: 0.5 }),
  };
  expect(
    edit.clips!.every(
      (clip) =>
        !extraInstances(clipRecipe(edit, clip)).some(
          (instance) => instance.effect === 'audioFadeOut',
        ),
    ),
  ).toBe(true);
  const graph = buildExportArgs(asset, edit, 'input', 'output').join(' ');
  expect(graph.match(/afade=t=out:st=2.5:d=0.5/g)).toHaveLength(2);
  expect(graph.match(/afade=t=out/g)).toHaveLength(2);
  edit = legacyAdd(legacyAdd(defaultSettings(asset), 'crop'), 'crop');
  edit.crop = { x: 0, y: 0, width: 100, height: 100 };
  edit = {
    ...edit,
    ...changeInstance(edit, extraInstances(edit)[0].id, null, {
      crop: { x: 0, y: 0, width: 200, height: 100 },
    }),
  };
  expect(() => parseEdit(JSON.parse(JSON.stringify(edit)), asset)).toThrow('preceding effects');
});
