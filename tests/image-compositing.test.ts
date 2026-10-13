import { afterAll, beforeAll, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ffmpegPath, probeFile } from '../electron/native';
import { defaultSettings, type EditSettings, type MediaAsset } from '../src/core/types';
import { defaultPainting } from '../src/core/painting';
import { imageBlendModes } from '../src/core/image-compositing';
import { defaultVisual } from '../src/core/visual-settings';
import { buildExportArgs } from '../src/core/export-plan';
import { recipeImages, resourcePaths } from '../src/core/resources';
import { parseProject, createProject } from '../src/core/project';
const exec = promisify(execFile);
let dir: string, input: string, asset: MediaAsset, paint: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'frame-composite-'));
  input = join(dir, 'source.png');
  const layer = join(dir, 'layer.png');
  await exec(ffmpegPath(), [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=0x804020@0.5:s=32x24,format=rgba',
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
    'color=white@0:s=32x24,format=rgba,drawbox=x=0:y=0:w=12:h=24:color=white@1:t=fill:replace=1',
    '-frames:v',
    '1',
    '-threads',
    '1',
    layer,
  ]);
  paint = 'data:image/png;base64,' + (await readFile(layer)).toString('base64');
  asset = { ...(await probeFile(input)), id: 'image', name: 'source.png', previewUrl: '' };
});
afterAll(async () => rm(dir, { recursive: true, force: true }));
async function render(edit: EditSettings) {
  const resources = resourcePaths(join(dir, 'resources'));
  for (const image of recipeImages(edit, resources))
    await import('node:fs/promises').then((fs) =>
      fs.writeFile(image.path, Buffer.from(image.data.split(',')[1], 'base64')),
    );
  const out = join(dir, 'output.png');
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
it.each(imageBlendModes)(
  'renders %s layers without altering untouched transparent areas',
  async (mode) => {
    const edit = {
      ...defaultSettings(asset),
      painting: { ...defaultPainting(), image: paint },
      imageLayers: {
        order: [],
        groups: [],
        entries: { 'primary:painting': { blend: mode, opacity: 0.5 } },
      },
    };
    const pixels = await render(edit),
      outside = (12 * 32 + 25) * 4,
      inside = (12 * 32 + 5) * 4;
    expect(pixels[outside]).toBeGreaterThan(120);
    expect(pixels[outside]).toBeLessThan(135);
    expect(pixels[outside + 3]).toBeGreaterThanOrEqual(126);
    expect(pixels[outside + 3]).toBeLessThanOrEqual(128);
    expect(pixels[inside + 3]).toBeGreaterThan(180);
    expect(pixels[inside + 3]).toBeLessThan(200);
    if (mode === 'multiply') expect(pixels[inside]).toBeLessThan(135);
  },
);
it('mixes adjustment opacity while preserving source alpha and project settings', async () => {
  const edit = {
    ...defaultSettings(asset),
    visual: { ...defaultVisual(), invert: 1 },
    imageLayers: {
      order: [],
      groups: [],
      entries: { 'primary:invert': { blend: 'normal' as const, opacity: 0.5 } },
    },
  };
  const pixels = await render(edit);
  expect(pixels[1]).toBeGreaterThan(120);
  expect(pixels[1]).toBeLessThan(135);
  expect(pixels[3]).toBeGreaterThanOrEqual(126);
  expect(pixels[3]).toBeLessThanOrEqual(128);
  expect(
    parseProject(createProject('Blends', [asset], () => edit, asset.id)).sources[0].edit
      .imageLayers,
  ).toEqual(edit.imageLayers);
});
