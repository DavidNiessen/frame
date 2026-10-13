import {
  parseMediaAnimation,
  shiftMediaAnimation,
  shiftKeyframes,
  setKeyframe,
  type MediaAnimation,
} from './keyframes';
import { defaultCurves, parseCurves, type Curves } from './curves';
import { sameLayerSource } from './audio-layers';
import { parseVisual, defaultVisual, type VisualSettings } from './visual-settings';
import type { SourceIdentity } from './project';
import type { EditSettings, MediaAsset, TimeRange } from './types';
import { editedDuration } from './timeline';
import { sourceIdentity } from './project';
import { outputTimeAtSource } from './fades';
export interface MediaLayer extends TimeRange {
  id: string;
  sourceId?: string;
  sourceIndex?: number;
  source: SourceIdentity;
  sourceStart: number;
  sourceEnd: number;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  fit: 'contain' | 'cover' | 'stretch';
  hidden: boolean;
  locked: boolean;
  visual: VisualSettings;
  curves?: Curves;
  animation?: MediaAnimation;
  audioLayerId?: string;
}
export function parseMediaLayers(input: unknown): MediaLayer[] {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 16)
    throw new Error('Use up to 16 video or image layers.');
  const ids = new Set<string>();
  return input.map((value: MediaLayer) => {
    const source = value?.source;
    if (
      !value ||
      typeof value.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,120}$/.test(value.id) ||
      ids.has(value.id) ||
      !source ||
      !['video', 'image'].includes(source.kind) ||
      typeof source.name !== 'string' ||
      !source.name.trim() ||
      source.name.length > 255 ||
      !Number.isSafeInteger(source.size) ||
      source.size < 0 ||
      typeof source.hasAudio !== 'boolean' ||
      !Number.isFinite(source.duration) ||
      source.duration <= 0 ||
      source.duration > 86400 ||
      ![source.width, source.height].every((n) => Number.isInteger(n) && n! >= 1 && n! <= 16384) ||
      (source.fingerprint !== undefined && !/^[a-f0-9]{64}$/.test(source.fingerprint))
    )
      throw new Error('Invalid visual layer source.');
    if (
      (value.sourceId !== undefined &&
        (typeof value.sourceId !== 'string' || !value.sourceId || value.sourceId.length > 120)) ||
      (value.sourceIndex !== undefined &&
        (!Number.isInteger(value.sourceIndex) ||
          value.sourceIndex < 0 ||
          value.sourceIndex >= 2000)) ||
      (value.audioLayerId !== undefined &&
        (typeof value.audioLayerId !== 'string' ||
          !value.audioLayerId ||
          value.audioLayerId.length > 120))
    )
      throw new Error('Invalid visual layer reference.');
    if (
      ![
        value.start,
        value.end,
        value.sourceStart,
        value.sourceEnd,
        value.x,
        value.y,
        value.width,
        value.height,
        value.opacity,
      ].every(Number.isFinite) ||
      value.start < 0 ||
      value.end > 86400 ||
      value.end - value.start < 0.05 ||
      value.sourceStart < 0 ||
      value.sourceEnd > source.duration + 0.001 ||
      value.sourceEnd - value.sourceStart < 0.05 ||
      value.x < -100 ||
      value.x > 200 ||
      value.y < -100 ||
      value.y > 200 ||
      value.width < 1 ||
      value.width > 200 ||
      value.height < 1 ||
      value.height > 200 ||
      value.opacity < 0 ||
      value.opacity > 1 ||
      typeof value.hidden !== 'boolean' ||
      typeof value.locked !== 'boolean' ||
      !['contain', 'cover', 'stretch'].includes(value.fit) ||
      (source.kind === 'video' &&
        value.end - value.start > value.sourceEnd - value.sourceStart + 0.001)
    )
      throw new Error('Invalid visual layer dimensions or timing.');
    ids.add(value.id);
    return {
      ...structuredClone(value),
      animation: parseMediaAnimation(value.animation),
      curves: parseCurves(value.curves),
      visual: parseVisual(value.visual),
    };
  });
}
export function mediaLayerSource(
  layer: Pick<MediaLayer, 'sourceId' | 'source'>,
  assets: MediaAsset[],
) {
  if (layer.sourceId) {
    const exact = assets.find((a) => a.id === layer.sourceId);
    if (exact) return sameLayerSource(layer.source, exact) ? exact : undefined;
  }
  const matches = assets.filter((a) => sameLayerSource(layer.source, a));
  return matches.length === 1 ? matches[0] : undefined;
}
export function resolveMediaLayers(
  edit: EditSettings,
  inputs: { asset: MediaAsset; path: string }[],
) {
  return parseMediaLayers(edit.mediaLayers).map((layer) => {
    const asset = mediaLayerSource(
        layer,
        inputs.map((item) => item.asset),
      ),
      input = inputs.find((item) => item.asset.id === asset?.id);
    if (!input) throw new Error(`Import “${layer.source.name}” to restore its visual track.`);
    return { layer, path: input.path };
  });
}
export function insertedMediaLayer(
  edit: EditSettings,
  base: MediaAsset,
  source: MediaAsset,
  current: number,
): MediaLayer {
  if (base.kind === 'audio' || source.kind === 'audio')
    throw new Error('Choose a video or image for visual layering.');
  if (base.kind === 'image' && source.kind === 'video')
    throw new Error('Select a video sequence to layer another video.');
  if ((edit.mediaLayers?.length ?? 0) >= 16) throw new Error('Use up to 16 video or image layers.');
  const duration = editedDuration(edit),
    start =
      base.kind === 'image'
        ? 0
        : Math.max(0, Math.min(duration - 0.05, outputTimeAtSource(edit, current))),
    length =
      source.kind === 'image' ? duration - start : Math.min(duration - start, source.duration);
  return {
    id: crypto.randomUUID(),
    sourceId: source.id,
    source: sourceIdentity(source),
    start,
    end: start + length,
    sourceStart: 0,
    sourceEnd: source.duration,
    x: 55,
    y: 55,
    width: 40,
    height: 40,
    opacity: 1,
    fit: 'contain',
    hidden: false,
    locked: false,
    visual: defaultVisual(),
    curves: defaultCurves(),
  };
}
/** Editing linked picture timing keeps its source audio in sync; unlink to edit them independently. */
export function changeMediaLayer(
  edit: EditSettings,
  id: string,
  patch: Partial<MediaLayer>,
): Partial<EditSettings> {
  const layer = edit.mediaLayers?.find((l) => l.id === id);
  if (!layer) return {};
  const next = { ...layer, ...patch },
    timing = ['start', 'end', 'sourceStart', 'sourceEnd'].some((key) => key in patch);
  return {
    mediaLayers: edit.mediaLayers!.map((item) => (item.id === id ? next : item)),
    ...(timing && layer.audioLayerId
      ? {
          audioLayers: edit.audioLayers?.map((item) =>
            item.id === layer.audioLayerId
              ? {
                  ...item,
                  start: next.start,
                  end: next.end,
                  sourceStart: next.sourceStart,
                  sourceEnd: next.sourceEnd,
                  volumeKeyframes:
                    patch.sourceStart !== undefined && patch.sourceStart !== layer.sourceStart
                      ? shiftKeyframes(item.volumeKeyframes, next.start - layer.start)
                      : item.volumeKeyframes,
                  fadeIn: Math.min(item.fadeIn, next.end - next.start),
                  fadeOut: Math.min(item.fadeOut, next.end - next.start),
                }
              : item,
          ),
        }
      : {}),
  };
}
export function removeMediaLayer(edit: EditSettings, id: string): Partial<EditSettings> {
  const layer = edit.mediaLayers?.find((l) => l.id === id);
  return {
    mediaLayers: edit.mediaLayers?.filter((l) => l.id !== id),
    ...(layer?.audioLayerId
      ? { audioLayers: edit.audioLayers?.filter((l) => l.id !== layer.audioLayerId) }
      : {}),
  };
}
export function resizeMediaLayer(
  edit: EditSettings,
  layer: MediaLayer,
  range: TimeRange,
  move = false,
) {
  const delta = range.start - layer.start,
    sourceStart =
      layer.source.kind === 'image' || move
        ? layer.sourceStart
        : Math.max(0, layer.sourceStart + delta),
    sourceEnd =
      layer.source.kind === 'image' ? layer.sourceEnd : sourceStart + range.end - range.start;
  return changeMediaLayer(edit, layer.id, {
    start: range.start,
    end: range.end,
    sourceStart,
    sourceEnd,
    ...(!move && delta ? { animation: shiftMediaAnimation(layer.animation, delta) } : {}),
  });
}
export function splitMediaLayer(edit: EditSettings, id: string, at: number): Partial<EditSettings> {
  const layer = edit.mediaLayers?.find((l) => l.id === id);
  if (!layer || at <= layer.start + 0.05 || at >= layer.end - 0.05) return {};
  const secondId = crypto.randomUUID(),
    sourceAt = layer.sourceStart + at - layer.start,
    left = { ...layer, end: at, ...(layer.source.kind === 'video' ? { sourceEnd: sourceAt } : {}) },
    right = {
      ...layer,
      id: secondId,
      start: at,
      animation: shiftMediaAnimation(layer.animation, at - layer.start),
      ...(layer.source.kind === 'video' ? { sourceStart: sourceAt } : {}),
    };
  const audio = edit.audioLayers?.find((a) => a.id === layer.audioLayerId),
    audioId = audio ? crypto.randomUUID() : undefined,
    audioLayers = audio
      ? edit.audioLayers!.flatMap((a) =>
          a.id !== audio.id
            ? [a]
            : [
                {
                  ...a,
                  end: at,
                  sourceEnd: sourceAt,
                  fadeIn: Math.min(a.fadeIn, at - layer.start),
                  fadeOut: Math.min(a.fadeOut, at - layer.start),
                },
                {
                  ...a,
                  id: audioId!,
                  start: at,
                  sourceStart: sourceAt,
                  volumeKeyframes: shiftKeyframes(a.volumeKeyframes, at - layer.start),
                  fadeIn: Math.min(a.fadeIn, layer.end - at),
                  fadeOut: Math.min(a.fadeOut, layer.end - at),
                },
              ],
        )
      : undefined;
  if (audioLayers) right.audioLayerId = audioId;
  return {
    mediaLayers: edit.mediaLayers!.flatMap((l) => (l.id === id ? [left, right] : [l])),
    ...(audioLayers ? { audioLayers } : {}),
  };
}

export function recordMediaChange(
  edit: EditSettings,
  layer: MediaLayer,
  patch: Partial<MediaLayer>,
  time: number,
): Partial<EditSettings> {
  const animation = { ...layer.animation };
  for (const property of ['x', 'y', 'width', 'height', 'opacity'] as const)
    if (animation[property] && patch[property] !== undefined)
      animation[property] = setKeyframe(
        animation[property],
        Math.max(0, Math.min(layer.end - layer.start, time - layer.start)),
        patch[property]!,
      );
  return changeMediaLayer(edit, layer.id, { ...patch, ...(layer.animation ? { animation } : {}) });
}
