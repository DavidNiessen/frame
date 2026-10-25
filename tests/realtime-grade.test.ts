import { expect, it } from 'vitest';
import { effectPreviewRecipe, needsEffectPreview } from '../src/core/effect-preview';
import {
  curveTable,
  gradeAt,
  gradeKernels,
  gradeOps,
  gradePasses,
  gradeLayerPasses,
  hasRealtimeGrade,
  imageGradePlan,
  maxPassOps,
} from '../src/core/realtime-grade';
import { defaultVisual } from '../src/core/visual-settings';
import { defaultCurves } from '../src/core/curves';
import { defaultSettings, type EditSettings, type MediaAsset } from '../src/core/types';

const video: MediaAsset = {
  id: 'video',
  name: 'clip.mp4',
  size: 1,
  kind: 'video',
  width: 1920,
  height: 1080,
  hasAudio: true,
  duration: 10,
  previewUrl: '',
};
const base = defaultSettings(video);
const graded: EditSettings = {
  ...base,
  color: { ...base.color, contrast: 1.3 },
  visual: { ...defaultVisual(), blur: 4, exposure: 0.5 },
  curves: {
    ...defaultCurves(),
    master: [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.6 },
      { x: 1, y: 1 },
    ],
  },
};

it('keeps color, curves, LUT and visual edits out of rendered previews when the GPU grades them', () => {
  expect(needsEffectPreview(graded)).toBe(true);
  expect(needsEffectPreview(graded, true, true)).toBe(false);
  const timed: EditSettings = {
    ...base,
    effectInstances: [
      {
        id: 'warm',
        effect: 'color',
        timeSpace: 'output',
        range: { start: 1, end: 2 },
        settings: { color: { ...base.color, temperature: 0.4 } },
      },
      { id: 'soft', effect: 'blur', settings: { visual: { ...defaultVisual(), blur: 2 } } },
    ],
  };
  expect(needsEffectPreview(timed)).toBe(true);
  expect(needsEffectPreview(timed, true, true)).toBe(false);
  // Audio processing still needs FFmpeg, but grading changes must not invalidate it.
  const noisy = { ...graded, reduceNoise: true };
  expect(needsEffectPreview(noisy, true, true)).toBe(true);
  const recipe = effectPreviewRecipe(video, noisy, true);
  expect(recipe.color).toEqual(base.color);
  expect(recipe.visual).toEqual(defaultVisual());
  expect(
    effectPreviewRecipe(
      video,
      {
        ...noisy,
        color: { ...noisy.color, contrast: 0.7 },
        effectInstances: timed.effectInstances,
      },
      true,
    ),
  ).toEqual(recipe);
});

it('bakes grading with media layers, which FFmpeg composites above the graded track', () => {
  const withLayer = { ...graded, mediaLayers: [{}] } as unknown as EditSettings;
  expect(needsEffectPreview(withLayer, true, true)).toBe(true);
  expect(effectPreviewRecipe(video, withLayer, true).color).toEqual(graded.color);
});

it('follows the export filter order and effect timing', () => {
  const edit: EditSettings = {
    ...graded,
    effectInstances: [
      {
        id: 'later',
        effect: 'color',
        timeSpace: 'output',
        range: { start: 2, end: 3 },
        settings: { color: { ...base.color, saturation: 0 } },
      },
    ],
  };
  const ops = (time: number) =>
    gradeAt(edit, time).steps.map((step) =>
      step.kind === 'kernel' ? step.kernel : (step as { op: number }).op,
    );
  expect(ops(0.5)).toEqual([gradeOps.curves, gradeOps.exposure, 'blur', gradeOps.eq]);
  expect(ops(2.5)).toEqual([gradeOps.curves, gradeOps.exposure, 'blur', gradeOps.eq, gradeOps.eq]);
  expect(hasRealtimeGrade(base)).toBe(false);
  expect(hasRealtimeGrade(edit)).toBe(true);
});

it('uses each clip’s own corrections across reordered splits', () => {
  const edit: EditSettings = {
    ...base,
    clips: [
      { id: 'b', start: 5, end: 10, effects: { color: { ...base.color, brightness: 0.2 } } },
      { id: 'a', start: 0, end: 5, effects: {} },
    ],
  };
  expect(gradeAt(edit, 6).steps).toHaveLength(1);
  expect(gradeAt(edit, 1).steps).toHaveLength(0);
  expect(hasRealtimeGrade(edit)).toBe(true);
});

it('splits passes at neighbourhood filters and per-pass textures', () => {
  const passes = gradePasses(gradeAt(graded, 0).steps);
  expect(passes.map((pass) => [pass.kernel, pass.ops.map((op) => op.op)])).toEqual([
    [0, [gradeOps.curves, gradeOps.exposure]],
    [gradeKernels.blurX, []],
    [gradeKernels.blurY, [gradeOps.eq]],
  ]);
  const luts = gradePasses([
    { kind: 'point', op: gradeOps.lut, a: [0, 0, 0, 0], b: [0, 0, 0, 0], lut: 'a' },
    { kind: 'point', op: gradeOps.lut, a: [0, 0, 0, 0], b: [0, 0, 0, 0], lut: 'b' },
  ]);
  expect(luts).toHaveLength(2);
  const many = gradePasses(
    Array.from({ length: maxPassOps + 1 }, () => ({
      kind: 'point' as const,
      op: gradeOps.negate,
      a: [0, 0, 0, 0] as [number, number, number, number],
      b: [0, 0, 0, 0] as [number, number, number, number],
    })),
  );
  expect(many.map((pass) => pass.ops.length)).toEqual([maxPassOps, 1]);
});

it('composes channel curves before the master curve', () => {
  const identity = curveTable(defaultCurves());
  expect([identity[0], identity[128 * 4], identity[255 * 4 + 2]]).toEqual([0, 128, 255]);
  const lifted = curveTable({
    ...defaultCurves(),
    red: [
      { x: 0, y: 0.5 },
      { x: 1, y: 1 },
    ],
    master: [
      { x: 0, y: 0 },
      { x: 1, y: 0.5 },
    ],
  });
  expect(lifted[0]).toBeCloseTo(64, -1);
  expect(lifted[1]).toBe(0);
});

it('plans adjustment-only image stacks for the GPU and leaves objects to FFmpeg', () => {
  const image: MediaAsset = { ...video, id: 'image', name: 'photo.png', kind: 'image' };
  const photo = defaultSettings(image);
  const adjusted: EditSettings = {
    ...photo,
    crop: { x: 10, y: 20, width: 300, height: 200 },
    visual: { ...defaultVisual(), exposure: 0.5, blur: 2 },
    imageLayers: {
      order: [],
      groups: [],
      entries: { 'primary:blur': { blend: 'screen', opacity: 0.5 } },
    },
  };
  const plan = imageGradePlan(image, adjusted)!;
  expect(plan.crop).toEqual(adjusted.crop);
  expect(plan.layers.map((layer) => [layer.blend, layer.opacity])).toEqual([
    ['normal', 1],
    ['screen', 0.5],
  ]);
  const passes = gradeLayerPasses(plan.layers);
  expect(passes.map((pass) => [pass.kernel, !!pass.layerStart, pass.blend])).toEqual([
    [0, false, undefined],
    [gradeKernels.blurX, true, undefined],
    [gradeKernels.blurY, false, 'screen'],
  ]);
  const masked = {
    ...adjusted,
    imageLayers: {
      ...adjusted.imageLayers!,
      entries: {
        'primary:blur': { mask: { mode: 'rectangle', x: 0, y: 0, width: 1, height: 1 } },
      },
    },
  } as unknown as EditSettings;
  expect(imageGradePlan(image, masked)).toBeNull();
  expect(plan.size).toEqual({ width: 300, height: 200 });
  const turned = imageGradePlan(image, {
    ...adjusted,
    geometry: { ...adjusted.geometry, rotation: 90, flipHorizontal: true },
  })!;
  // A clockwise turn and a mirror transpose: output right comes from source bottom.
  expect(turned.turn).toEqual([0, -1, -1, 0]);
  expect(turned.size).toEqual({ width: 200, height: 300 });
  const resize = (fit: 'contain' | 'cover' | 'stretch', width: number) =>
    imageGradePlan(image, {
      ...adjusted,
      geometry: { ...adjusted.geometry, resize: { width, height: 100, fit } },
    });
  expect(resize('stretch', 400)?.size).toEqual({ width: 400, height: 100 });
  expect(resize('cover', 150)?.size).toEqual({ width: 150, height: 100 });
  expect(resize('contain', 400)).toBeNull();
  expect(
    imageGradePlan(image, { ...adjusted, overlays: { ...adjusted.overlays, text: 'Credit' } }),
  ).toBeNull();
});
