import { afterAll, beforeAll, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ffmpegPath, probeFile } from '../electron/native';
import { defaultSettings, type EditSettings, type MediaAsset } from '../src/core/types';
import { defaultImageMask, parseImageMask, type ImageMask } from '../src/core/image-masks';
import { defaultVisual } from '../src/core/visual-settings';
import { buildExportArgs } from '../src/core/export-plan';
import { recipeImages, resourcePaths } from '../src/core/resources';
import { createProject, parseProject } from '../src/core/project';
const exec = promisify(execFile);
let dir: string, input: string, asset: MediaAsset, brush: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'frame-mask-'));
  input = join(dir, 'source.png');
  const paint = join(dir, 'mask.png');
  await exec(ffmpegPath(), [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=0x402010@0.5:s=64x48,format=rgba',
    '-frames:v',
    '1',
    '-threads',
    '1',
    input,
  ]);
  await exec(ffmpegPath(), [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=white@0:s=64x48,format=rgba,drawbox=x=20:y=12:w=24:h=24:color=white@1:t=fill:replace=1',
    '-frames:v',
    '1',
    '-threads',
    '1',
    paint,
  ]);
  brush = 'data:image/png;base64,' + (await readFile(paint)).toString('base64');
  asset = { ...(await probeFile(input)), id: 'image', name: 'source.png', previewUrl: '' };
});
afterAll(async () => rm(dir, { recursive: true, force: true }));
async function render(mask: ImageMask) {
  const edit: EditSettings = {
      ...defaultSettings(asset),
      visual: { ...defaultVisual(), exposure: 1 },
      imageLayers: { order: [], groups: [], entries: { 'primary:exposure': { mask } } },
    },
    resources = resourcePaths(join(dir, 'resources'));
  for (const image of recipeImages(edit, resources))
    await writeFile(image.path, Buffer.from(image.data.split(',')[1], 'base64'));
  const out = join(dir, 'out.png');
  await exec(ffmpegPath(), buildExportArgs(asset, edit, input, out, resources));
  return (
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
  ).stdout;
}
it.each(['rectangle', 'ellipse', 'brush'] as const)(
  'applies a %s effect mask while preserving original pixels and alpha outside it',
  async (mode) => {
    const mask = {
        ...defaultImageMask(),
        mode,
        feather: 0,
        brush: { ...defaultImageMask().brush, image: brush },
      },
      pixels = await render(mask),
      inside = (24 * 64 + 32) * 4,
      outside = (24 * 64 + 5) * 4;
    expect(pixels[inside]).toBeGreaterThan(110);
    expect(pixels[outside]).toBeLessThan(75);
    expect(pixels[outside + 1]).toBeLessThan(40);
    expect(pixels[outside + 2]).toBeLessThan(25);
    expect(pixels[inside + 3]).toBeGreaterThanOrEqual(126);
    expect(pixels[inside + 3]).toBeLessThanOrEqual(128);
    expect(pixels[outside + 3]).toBeGreaterThanOrEqual(126);
    expect(pixels[outside + 3]).toBeLessThanOrEqual(128);
    const inverted = await render({ ...mask, invert: true });
    expect(inverted[inside]).toBeLessThan(75);
    expect(inverted[outside]).toBeGreaterThan(110);
  },
);
it('softens mask edges and persists masked independent effects', async () => {
  const mask = {
      ...defaultImageMask(),
      mode: 'rectangle' as const,
      x: 0.5,
      y: 0,
      width: 0.5,
      height: 1,
      feather: 0.1,
    },
    pixels = await render(mask),
    edge = (24 * 64 + 32) * 4;
  expect(pixels[edge]).toBeGreaterThan(70);
  expect(pixels[edge]).toBeLessThan(120);
  const edit = {
    ...defaultSettings(asset),
    effectInstances: [
      {
        id: 'light',
        effect: 'exposure' as const,
        settings: { visual: { ...defaultVisual(), exposure: 1 } },
      },
    ],
    imageLayers: { order: [], groups: [], entries: { 'instance:light': { mask } } },
  };
  expect(
    parseProject(createProject('Mask', [asset], () => edit, asset.id)).sources[0].edit.imageLayers,
  ).toEqual(edit.imageLayers);
});
it('rejects invalid selection bounds and embedded brush rasters', () => {
  expect(() => parseImageMask({ ...defaultImageMask(), width: 2 })).toThrow();
  expect(() => parseImageMask({ ...defaultImageMask(), feather: NaN })).toThrow();
  expect(() =>
    parseImageMask({
      ...defaultImageMask(),
      brush: { ...defaultImageMask().brush, image: 'data:text/plain,not-an-image' },
    }),
  ).toThrow();
});
