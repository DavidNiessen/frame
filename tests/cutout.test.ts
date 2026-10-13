import { beforeAll, afterAll, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { defaultCutout, parseCutout } from '../src/core/cutout';
import { cutoutPixels } from '../src/core/cutout-raster';
import { encodePixelsPng } from '../src/core/png-encoding';
import { defaultSettings, type MediaAsset } from '../src/core/types';
import { createProject, parseProject } from '../src/core/project';
import { buildExportArgs } from '../src/core/export-plan';
import { recipeImages, resourcePaths } from '../src/core/resources';
import { ffmpegPath } from '../electron/native';
const w = 64,
  h = 48,
  photo = () => {
    const pixels = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        pixels.set(
          x >= 16 && x < 48 && y >= 12 && y < 36 ? [40, 160, 80, 128] : [230, 230, 230, 255],
          (y * w + x) * 4,
        );
    return pixels;
  };
const pixel = (data: Uint8ClampedArray, x: number, y: number) => data[(y * w + x) * 4 + 3];
let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'frame-cutout-'));
});
afterAll(async () => rm(dir, { recursive: true, force: true }));
it('removes connected background while preserving enclosed matching areas and source alpha', () => {
  const base = photo();
  base.set([230, 230, 230, 255], (24 * w + 32) * 4);
  const mask = cutoutPixels(base, w, h, { ...defaultCutout(), feather: 0 });
  expect(pixel(mask, 3, 3)).toBe(0);
  expect(pixel(mask, 20, 20)).toBe(255);
  expect(pixel(mask, 32, 24)).toBe(255);
  const all = cutoutPixels(base, w, h, { ...defaultCutout(), feather: 0, contiguous: false });
  expect(pixel(all, 32, 24)).toBe(0);
  expect(base[(20 * w + 20) * 4 + 3]).toBe(128);
});
it('uses sampled color, feathers edges, and lets brush strokes restore/remove independently', () => {
  const value = {
      ...defaultCutout(),
      background: 'sample' as const,
      sample: { x: 0.1, y: 0.1 },
      feather: 0.02,
    },
    soft = cutoutPixels(photo(), w, h, value);
  expect(pixel(soft, 16, 24)).toBeGreaterThan(0);
  expect(pixel(soft, 16, 24)).toBeLessThan(255);
  const refined = cutoutPixels(photo(), w, h, {
    ...value,
    strokes: [
      { points: [{ x: 0.1, y: 0.1 }], color: '#ffffff', size: 0.1, opacity: 1, erase: false },
      { points: [{ x: 0.4, y: 0.4 }], color: '#000000', size: 0.1, opacity: 1, erase: false },
    ],
  });
  expect(pixel(refined, 6, 5)).toBeGreaterThan(220);
  expect(pixel(refined, 26, 19)).toBeLessThan(20);
});
it('exports the exact mask without restoring alpha and persists the editable refinement strokes', async () => {
  const asset: MediaAsset = {
      id: 'photo',
      name: 'photo.png',
      size: 100,
      kind: 'image',
      duration: 1,
      width: w,
      height: h,
      hasAudio: false,
      previewUrl: '',
    },
    mask = cutoutPixels(photo(), w, h, { ...defaultCutout(), feather: 0 }),
    image = 'data:image/png;base64,' + Buffer.from(encodePixelsPng(w, h, mask)).toString('base64'),
    edit = { ...defaultSettings(asset), cutout: { ...defaultCutout(), image } },
    input = join(dir, 'photo.png'),
    out = join(dir, 'out.png'),
    paths = resourcePaths(join(dir, 'resources'));
  await writeFile(input, encodePixelsPng(w, h, photo()));
  for (const resource of recipeImages(edit, paths))
    await writeFile(resource.path, Buffer.from(resource.data.split(',')[1], 'base64'));
  const exec = promisify(execFile);
  await exec(ffmpegPath(), buildExportArgs(asset, edit, input, out, paths));
  const data = (
    await exec(
      ffmpegPath(),
      ['-v', 'error', '-i', out, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-threads', '1', '-'],
      { encoding: 'buffer' },
    )
  ).stdout;
  expect(data[(3 * w + 3) * 4 + 3]).toBe(0);
  expect(data[(24 * w + 32) * 4 + 3]).toBeGreaterThanOrEqual(127);
  expect(data[(24 * w + 32) * 4 + 3]).toBeLessThanOrEqual(128);
  expect(data[(24 * w + 32) * 4 + 1]).toBeGreaterThan(150);
  expect(
    parseProject(createProject('Cutout', [asset], () => edit, asset.id)).sources[0].edit.cutout,
  ).toEqual(edit.cutout);
});
it('rejects invalid masks and color samples', () => {
  expect(() => parseCutout({ ...defaultCutout(), tolerance: 2 })).toThrow();
  expect(() => parseCutout({ ...defaultCutout(), sample: { x: -1, y: 0 } })).toThrow();
  expect(() => parseCutout({ ...defaultCutout(), image: 'not a PNG' })).toThrow();
});
