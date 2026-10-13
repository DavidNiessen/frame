import { expect, it } from 'vitest';
import { defaultRetouch, parseRetouch, type RetouchStroke } from '../src/core/retouch';
import { retouchPixels } from '../src/core/retouch-raster';
import { defaultSettings, type MediaAsset } from '../src/core/types';
import { availableEffects } from '../src/core/effect-library';
import { createProject, parseProject } from '../src/core/project';
import { imageEditBeforeLayer, imageLayerKey } from '../src/core/image-layers';
const width = 100,
  height = 100;
const base = () => {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      pixels.set([x < 50 ? 180 : 80, 60, 40, 255], at);
    }
  return pixels;
};
const stroke: RetouchStroke = {
  points: [{ x: 0.75, y: 0.5 }],
  source: { x: 0.25, y: 0.5 },
  mode: 'clone',
  size: 0.2,
  hardness: 0.2,
  opacity: 1,
};
const asset: MediaAsset = {
  id: 'image',
  name: 'photo.png',
  kind: 'image',
  duration: 1,
  width,
  height,
  size: 100,
  hasAudio: false,
  previewUrl: '',
};
it('clones source texture with soft edges and leaves surrounding pixels untouched', () => {
  const original = base(),
    output = retouchPixels(original, width, height, [stroke]),
    at = (50 * width + 75) * 4;
  expect(output[at]).toBe(180);
  expect(output[at + 3]).toBe(255);
  expect(output[at + 8 * 4 + 3]).toBeGreaterThan(0);
  expect(output[at + 8 * 4 + 3]).toBeLessThan(150);
  expect(output[at + 11 * 4 + 3]).toBe(0);
  expect(original).toEqual(base());
});
it('healing matches local destination color while preserving sampled texture', () => {
  const original = base(),
    at = (50 * width + 25) * 4;
  original[at] = 210;
  const output = retouchPixels(original, width, height, [{ ...stroke, mode: 'heal' }]),
    target = (50 * width + 75) * 4;
  expect(output[target]).toBe(110);
  expect(output[target + 4]).toBe(80);
});
it('erases only its own retouch layer and interpolates continuous strokes', () => {
  const path = {
    ...stroke,
    points: [
      { x: 0.65, y: 0.5 },
      { x: 0.85, y: 0.5 },
    ],
  };
  const output = retouchPixels(base(), width, height, [path]);
  expect(output[(50 * width + 75) * 4 + 3]).toBeGreaterThan(250);
  const erased = retouchPixels(base(), width, height, [
    path,
    { ...stroke, mode: 'erase', hardness: 1 },
  ]);
  expect(erased[(50 * width + 75) * 4 + 3]).toBe(0);
});
it('persists independent retouch layers and samples only lower adjustments', () => {
  const edit = {
    ...defaultSettings(asset),
    retouch: { ...defaultRetouch(), strokes: [stroke] },
    addedEffects: ['retouch', 'invert'] as ('retouch' | 'invert')[],
    imageLayers: {
      order: [imageLayerKey('retouch'), imageLayerKey('invert')],
      entries: {},
      groups: [],
    },
  };
  const before = imageEditBeforeLayer(asset, edit, 'primary:retouch');
  expect(before.imageLayers?.entries['primary:retouch'].hidden).toBe(true);
  expect(before.imageLayers?.entries['primary:invert'].hidden).toBe(true);
  expect(
    parseProject(createProject('Retouch', [asset], () => edit, asset.id)).sources[0].edit.retouch
      ?.strokes,
  ).toEqual([stroke]);
  expect(availableEffects({ ...asset, kind: 'video' }).some((e) => e.id === 'retouch')).toBe(false);
});
it('rejects invalid source points, brushes and embedded rasters', () => {
  expect(() => parseRetouch({ ...defaultRetouch(), source: { x: 2, y: 0 } })).toThrow();
  expect(() =>
    parseRetouch({ ...defaultRetouch(), strokes: [{ ...stroke, opacity: NaN }] }),
  ).toThrow();
  expect(() => parseRetouch({ ...defaultRetouch(), image: 'data:text/plain,anything' })).toThrow();
});
