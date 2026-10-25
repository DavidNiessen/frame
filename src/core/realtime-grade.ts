import { clipAtSource, clipPositions, clipRecipe, editClips } from './clips';
import { defaultColor, type ColorSettings } from './color';
import { curveChannels, curveSamples, hasCurves, parseCurves, type Curves } from './curves';
import { extraInstances, instanceRecipe } from './effect-instances';
import { outputTimeAtSource } from './fades';
import { activeAtSource } from './timed-adjustments';
import { defaultVisual, isVisualEffect } from './visual-settings';
import type { VisualSettings } from './visual-settings';
import type { Crop, EditSettings, MediaAsset, TimeRange } from './types';
import { imageLayerRows } from './image-layers';
import type { ImageBlendMode } from './image-compositing';
import type { MediaLayer } from './media-layers';

/**
 * Real-time grading: color, curves, LUTs and visual adjustments are evaluated per
 * displayed frame on the GPU instead of rendering a new preview file for each
 * edit. Steps follow the FFmpeg export order (see `rawVideoFilters`).
 */
export const gradeOps = {
  exposure: 1,
  eq: 2,
  shadowsHighlights: 3,
  vibrance: 4,
  hue: 5,
  balance: 6,
  vignette: 7,
  sepia: 8,
  negate: 9,
  posterize: 10,
  grain: 11,
  curves: 12,
  lut: 13,
} as const;
export const gradeKernels = {
  blurX: 1,
  blurY: 2,
  sharpen: 3,
  pixelate: 4,
  sketch: 5,
  emboss: 6,
} as const;
type Vec4 = [number, number, number, number];
export interface GradePointStep {
  op: number;
  a: Vec4;
  b: Vec4;
  curves?: Curves;
  lut?: string;
}
export type GradeStep =
  | ({ kind: 'point' } & GradePointStep)
  | {
      kind: 'kernel';
      kernel: 'blur' | 'sharpen' | 'pixelate' | 'sketch' | 'emboss';
      value: number;
    };
export interface GradePass {
  kernel: number;
  value: number;
  ops: GradePointStep[];
  /** The input of this pass is the layer below a later blended pass. */
  layerStart?: boolean;
  blend?: ImageBlendMode;
  opacity?: number;
}
interface GradeStage {
  range?: TimeRange;
  output: boolean;
  steps: GradeStep[];
}
export const maxPassOps = 16;
const zero: Vec4 = [0, 0, 0, 0];
const point = (op: number, a: Vec4 = zero, b: Vec4 = zero): GradeStep => ({
  kind: 'point',
  op,
  a,
  b,
});

/** Mirrors `visualFilters`, including its order and where neighbourhood filters split passes. */
function visualSteps(settings?: VisualSettings): GradeStep[] {
  const v = { ...defaultVisual(), ...settings },
    steps: GradeStep[] = [];
  if (v.exposure) steps.push(point(gradeOps.exposure, [2 ** v.exposure, 0, 0, 0]));
  if (v.gamma !== 1) steps.push(point(gradeOps.eq, [0, 1, 1, v.gamma]));
  if (v.shadows || v.highlights)
    steps.push(point(gradeOps.shadowsHighlights, [v.shadows, v.highlights, 0, 0]));
  if (v.vibrance) steps.push(point(gradeOps.vibrance, [v.vibrance, 0, 0, 0]));
  if (v.hue) steps.push(point(gradeOps.hue, [v.hue, 1, 0, 0]));
  if (v.tint)
    steps.push(point(gradeOps.balance, zero, [v.tint * 0.2, -v.tint * 0.2, v.tint * 0.2, 0]));
  if (v.vignette) steps.push(point(gradeOps.vignette, [(v.vignette * Math.PI) / 3, 0, 0, 0]));
  if (v.blur) steps.push({ kind: 'kernel', kernel: 'blur', value: v.blur });
  if (v.sharpen) steps.push({ kind: 'kernel', kernel: 'sharpen', value: v.sharpen });
  if (v.grayscale) steps.push(point(gradeOps.hue, [0, 1 - v.grayscale, 0, 0]));
  if (v.sepia) steps.push(point(gradeOps.sepia, [v.sepia, 0, 0, 0]));
  if (v.invert) steps.push(point(gradeOps.negate));
  if (v.pixelate > 1) steps.push({ kind: 'kernel', kernel: 'pixelate', value: v.pixelate });
  if (v.posterize !== 256) steps.push(point(gradeOps.posterize, [v.posterize, 0, 0, 0]));
  if (v.grain) steps.push(point(gradeOps.grain, [v.grain, 0, 0, 0]));
  if (v.sketch) steps.push({ kind: 'kernel', kernel: 'sketch', value: 1 }, point(gradeOps.negate));
  if (v.emboss) steps.push({ kind: 'kernel', kernel: 'emboss', value: 1 });
  return steps;
}
/** Mirrors `colorFilters`. */
function colorSteps(input?: ColorSettings): GradeStep[] {
  const c = { ...defaultColor(), ...input },
    steps: GradeStep[] = [];
  if (c.brightness || c.contrast !== 1 || c.saturation !== 1)
    steps.push(point(gradeOps.eq, [c.brightness, c.contrast, c.saturation, 1]));
  if (c.temperature)
    steps.push(
      point(
        gradeOps.balance,
        [c.temperature * 0.2, 0, -c.temperature * 0.2, 0],
        [c.temperature * 0.1, 0, -c.temperature * 0.1, 0],
      ),
    );
  if (c.lut) steps.push({ ...point(gradeOps.lut), lut: c.lut } as GradeStep);
  return steps;
}
function curveSteps(input?: Curves): GradeStep[] {
  return input && hasCurves(input)
    ? [{ ...point(gradeOps.curves), curves: input } as GradeStep]
    : [];
}
function stagesFor(recipe: EditSettings): GradeStage[] {
  const stages: GradeStage[] = [
    { range: recipe.effectRanges?.curves, output: false, steps: curveSteps(recipe.curves) },
    { output: false, steps: visualSteps(recipe.visual) },
    { range: recipe.effectRanges?.color, output: false, steps: colorSteps(recipe.color) },
  ];
  for (const instance of extraInstances(recipe)) {
    const view = instanceRecipe(recipe, instance),
      steps = isVisualEffect(instance.effect)
        ? visualSteps(view.visual)
        : instance.effect === 'curves'
          ? curveSteps(view.curves)
          : instance.effect === 'color'
            ? colorSteps(view.color)
            : [];
    stages.push({ range: instance.range, output: instance.timeSpace === 'output', steps });
  }
  return stages.filter((stage) => stage.steps.length);
}
const stageCache = new WeakMap<EditSettings, Map<string, GradeStage[]>>();
function cachedStages(edit: EditSettings, clipId: string | undefined, recipe: () => EditSettings) {
  let entries = stageCache.get(edit);
  if (!entries) stageCache.set(edit, (entries = new Map()));
  const key = clipId ?? '';
  let stages = entries.get(key);
  if (!stages) entries.set(key, (stages = stagesFor(recipe())));
  return stages;
}

/** A media layer's own grade, in `mediaLayerFilters` order. */
export const mediaLayerGrade = (layer: Pick<MediaLayer, 'curves' | 'visual'>) => [
  ...curveSteps(layer.curves),
  ...visualSteps(layer.visual),
];

/** Whether any part of the recipe grades pixels, independent of the playhead. */
export const hasRealtimeGrade = (edit: EditSettings) =>
  stagesFor(edit).length > 0 ||
  editClips(edit).some((clip) => cachedStages(edit, clip.id, () => clipRecipe(edit, clip)).length);

/** The grading steps visible at a playback position, and the crop they are measured against. */
export function gradeAt(edit: EditSettings, sourceTime: number, mediaTime?: number) {
  const position = outputTimeAtSource(edit, sourceTime, mediaTime);
  const clip = edit.clips
    ? (clipPositions(edit).find((item) => position >= item.start && position < item.end)?.clip ??
      clipAtSource(edit, sourceTime))
    : undefined;
  const recipe = () => (clip ? clipRecipe(edit, clip) : edit);
  const steps = cachedStages(edit, clip?.id, recipe)
    .filter((stage) => activeAtSource(stage.range, stage.output ? position : sourceTime))
    .flatMap((stage) => stage.steps);
  const view = recipe();
  const crop: Crop | null =
    view.crop ??
    extraInstances(view, 'crop').find((instance) => instance.timeSpace === 'output')?.settings
      .crop ??
    null;
  return { steps, crop };
}

/** Each pass samples its input once through an optional kernel, then applies point operations. */
export function gradePasses(steps: GradeStep[]): GradePass[] {
  const passes: GradePass[] = [];
  let current: GradePass | null = null;
  const open = (kernel = 0, value = 0) => {
    current = { kernel, value, ops: [] };
    passes.push(current);
    return current;
  };
  for (const step of steps) {
    if (step.kind === 'kernel') {
      if (step.kernel === 'blur') {
        open(gradeKernels.blurX, step.value);
        open(gradeKernels.blurY, step.value);
      } else open(gradeKernels[step.kernel], step.value);
      continue;
    }
    const pass: GradePass = current ?? open();
    // One curve table and one LUT texture are bound per pass.
    const conflict =
      pass.ops.length >= maxPassOps ||
      (step.curves && pass.ops.some((op) => op.curves)) ||
      (step.lut && pass.ops.some((op) => op.lut));
    const { kind: _kind, ...op } = step;
    (conflict ? open() : pass).ops.push(op);
  }
  return passes;
}

/** 256 RGBA entries: each channel's curve followed by FFmpeg's second-pass master curve. */
export function curveTable(input: Curves): Uint8Array {
  const curves = parseCurves(input),
    master = curveSamples(curves.master),
    table = new Uint8Array(256 * 4);
  const channels = curveChannels.slice(1).map((channel) => curveSamples(curves[channel]));
  for (let i = 0; i < 256; i++) {
    channels.forEach((samples, channel) => {
      table[i * 4 + channel] = Math.round(master[Math.round(samples[i] * 255)] * 255);
    });
    table[i * 4 + 3] = 255;
  }
  return table;
}

/** Normalized `.cube` contents for a 3D texture (red varies fastest, as in the file). */
export function cubeTexture(cube: string) {
  let size = 0,
    min = [0, 0, 0],
    max = [1, 1, 1];
  const values: number[] = [];
  for (const line of cube.split('\n')) {
    const [key, ...parts] = line.trim().split(/\s+/);
    if (key === 'LUT_3D_SIZE') size = Number(parts[0]);
    else if (key === 'DOMAIN_MIN') min = parts.map(Number);
    else if (key === 'DOMAIN_MAX') max = parts.map(Number);
    else if (key) values.push(Number(key), ...parts.map(Number));
  }
  return { size, min, max, data: Float32Array.from(values) };
}

export interface GradeLayer {
  steps: GradeStep[];
  blend: ImageBlendMode;
  opacity: number;
}
/** Blended layers keep their own passes; consecutive normal layers share them. */
export function gradeLayerPasses(layers: GradeLayer[]): GradePass[] {
  const passes: GradePass[] = [];
  let normal: GradeStep[] = [];
  const flush = () => {
    passes.push(...gradePasses(normal));
    normal = [];
  };
  for (const layer of layers) {
    if (layer.blend === 'normal' && layer.opacity === 1) {
      normal.push(...layer.steps);
      continue;
    }
    flush();
    const own = gradePasses(layer.steps);
    if (!own.length) continue;
    own[0].layerStart = true;
    Object.assign(own.at(-1)!, { blend: layer.blend, opacity: layer.opacity });
    passes.push(...own);
  }
  flush();
  return passes;
}

/**
 * The image stack as GPU layers, mirroring `imageLayerStages`, or null when it
 * contains layers that need FFmpeg: objects, masks, retouching or transforms.
 */
export function imageGradePlan(asset: MediaAsset, edit: EditSettings) {
  let crop: Crop | null = null;
  const layers: GradeLayer[] = [];
  for (const row of imageLayerRows(asset, edit)) {
    if (row.hidden) continue;
    const recipe = row.recipe,
      id = row.effect.id;
    if (id === 'crop') {
      const next = recipe.crop;
      if (next) crop = crop ? { ...next, x: crop.x + next.x, y: crop.y + next.y } : { ...next };
      continue;
    }
    if (id === 'transform') {
      const g = recipe.geometry;
      if (g.rotation || g.flipHorizontal || g.flipVertical || g.resize) return null;
      continue;
    }
    if (row.state.mask && row.state.mask.mode !== 'none') return null;
    const steps = isVisualEffect(id)
      ? visualSteps({ ...defaultVisual(), [id]: recipe.visual?.[id] ?? defaultVisual()[id] })
      : id === 'curves'
        ? curveSteps(recipe.curves)
        : id === 'color'
          ? colorSteps(recipe.color)
          : null;
    if (!steps) return null;
    const opacity = row.state.opacity ?? 1;
    if (steps.length && opacity > 0)
      layers.push({ steps, blend: row.state.blend ?? 'normal', opacity });
  }
  return { layers, crop };
}
