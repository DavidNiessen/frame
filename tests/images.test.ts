import { beforeAll, afterAll, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ffmpegPath, ffprobePath, probeFile } from '../electron/native';
import { buildExportArgs } from '../src/core/export-plan';
import { defaultSettings, type FormatId, type MediaAsset } from '../src/core/types';
import { effectPreviewArgs, effectPreviewRecipe } from '../src/core/effect-preview';
import { resourcePaths, recipeImages } from '../src/core/resources';
import { addTimelineEffect } from '../src/core/timeline-effects';
import { visualIds, visualControls, defaultVisual } from '../src/core/visual-settings';
import { parseProject, createProject } from '../src/core/project';
import { defaultPainting, parsePainting } from '../src/core/painting';
const exec = promisify(execFile),
  ffmpeg = ffmpegPath();
let directory: string, input: string, asset: MediaAsset;
const pixel = async (path: string) =>
  (
    await exec(
      ffmpeg,
      [
        '-v',
        'error',
        '-i',
        path,
        '-vf',
        'scale=1:1',
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
  ).stdout;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'frame-images-'));
  input = join(directory, 'source.png');
  await exec(ffmpeg, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=red@0.5:s=64x48,format=rgba',
    '-frames:v',
    '1',
    '-threads',
    '1',
    input,
  ]);
  asset = { ...(await probeFile(input)), id: 'image', previewUrl: '', name: 'source.png' };
});
afterAll(async () => rm(directory, { recursive: true, force: true }));
it('recognizes still images without duration and persists image projects', () => {
  expect(asset.kind).toBe('image');
  expect(asset.duration).toBe(1);
  const edit = defaultSettings(asset);
  const doc = createProject('Image', [asset], () => edit, asset.id);
  expect(parseProject(doc).sources[0].source.kind).toBe('image');
});
it.each<FormatId>(['png', 'jpeg', 'webp', 'bmp', 'tiff'])(
  'exports a real %s image with correct dimensions',
  async (format) => {
    const edit = { ...defaultSettings(asset), format },
      output = join(directory, `photo.${format}`);
    await exec(ffmpeg, buildExportArgs(asset, edit, input, output));
    const { stdout } = await exec(ffprobePath(), [
      '-v',
      'error',
      '-show_streams',
      '-of',
      'json',
      output,
    ]);
    const stream = JSON.parse(stdout).streams[0];
    expect(stream.width).toBe(64);
    expect(stream.height).toBe(48);
    if (['png', 'webp', 'tiff'].includes(format))
      expect((await pixel(output))[3]).toBeGreaterThanOrEqual(120);
  },
);
it('preserves PNG alpha and uses the selected matte for JPEG', async () => {
  let output = join(directory, 'alpha.png'),
    edit = defaultSettings(asset);
  await exec(ffmpeg, buildExportArgs(asset, edit, input, output));
  expect((await pixel(output))[3]).toBeGreaterThanOrEqual(126);
  expect((await pixel(output))[3]).toBeLessThanOrEqual(128);
  edit = {
    ...edit,
    format: 'jpeg',
    imageOutput: { quality: 100, lossless: false, background: '#0000ff' },
  };
  output = join(directory, 'matte.jpeg');
  await exec(ffmpeg, buildExportArgs(asset, edit, input, output));
  const p = await pixel(output);
  expect(p[0]).toBeGreaterThan(100);
  expect(p[2]).toBeGreaterThan(100);
  expect(p[1]).toBeLessThan(10);
});
it.each(visualIds)('renders %s in image preview and timed video export', async (id) => {
  const edit = {
      ...defaultSettings(asset),
      visual: { ...defaultVisual(), [id]: visualControls[id].initial },
    },
    output = join(directory, `${id}.png`);
  await exec(
    ffmpeg,
    effectPreviewArgs(asset, effectPreviewRecipe(asset, edit), input, output, resourcePaths()),
  );
  expect((await probeFile(output)).width).toBe(64);
  const alpha = (await pixel(output))[3];
  expect(alpha, `${id} must preserve transparency`).toBeGreaterThanOrEqual(126);
  expect(alpha, `${id} must preserve transparency`).toBeLessThanOrEqual(128);
  const video: MediaAsset = { ...asset, kind: 'video', duration: 1, name: 'source.mp4' },
    recipe = defaultSettings(video);
  Object.assign(recipe, addTimelineEffect(recipe, video, id));
  const args = buildExportArgs(video, recipe, input, join(directory, `${id}.mp4`));
  await exec(ffmpeg, args);
});
it('composites independent paint layers into exported pixels', async () => {
  const paint = join(directory, 'paint.png');
  await exec(ffmpeg, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=blue:s=64x48,format=rgba',
    '-frames:v',
    '1',
    '-threads',
    '1',
    paint,
  ]);
  const { readFile } = await import('node:fs/promises'),
    edit = defaultSettings(asset);
  Object.assign(edit, addTimelineEffect(edit, asset, 'painting'));
  edit.effectInstances![0].settings.painting = {
    ...defaultPainting(),
    image: `data:image/png;base64,${(await readFile(paint)).toString('base64')}`,
  };
  const paths = resourcePaths(join(directory, 'paint'));
  for (const resource of recipeImages(edit, paths))
    await writeFile(resource.path, Buffer.from(resource.data.split(',')[1], 'base64'));
  const output = join(directory, 'painted.png');
  await exec(ffmpeg, buildExportArgs(asset, edit, input, output, paths));
  const p = await pixel(output);
  expect(p[2]).toBeGreaterThan(240);
  expect(p[0]).toBeLessThan(10);
  expect(() =>
    parsePainting({
      ...defaultPainting(),
      strokes: [
        { points: [{ x: -1, y: 0 }], color: '#ffffff', size: 0.1, opacity: 1, erase: false },
      ],
    }),
  ).toThrow();
});
