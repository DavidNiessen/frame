import { captionItems } from './caption-items';
import { allAudioLayers, extraInstances } from './effect-instances';
import { clipPositions } from './clips';
import { outputTimeAtSource } from './fades';
import type { EditSettings } from './types';
export type SnapSpace = 'source' | 'output';
export function snapTargets(
  edit: EditSettings,
  duration: number,
  current?: number,
): Record<SnapSpace, number[]> {
  const positions = clipPositions(edit);
  const timedOutput = [
    ...(edit.mediaLayers ?? []).flatMap((layer) => [layer.start, layer.end]),
    ...allAudioLayers(edit).flatMap((layer) => [layer.start, layer.end]),
    ...extraInstances(edit)
      .filter((instance) => instance.timeSpace === 'output')
      .flatMap((instance) => {
        const ranges = [
          instance.range,
          instance.settings.overlays?.range,
          ...(instance.settings.subtitles?.cues ?? []),
        ].filter((range) => !!range);
        return ranges.flatMap((range) => [range.start, range.end]);
      }),
  ];
  // Timed effects live on the edited sequence. Map their landmarks back into
  // each retained section so source trim handles can snap to them too.
  const timedSource = positions.flatMap((item) =>
    timedOutput
      .filter((time) => time >= item.start && time <= item.end)
      .map((time) => item.clip.start + (time - item.start) * item.speed),
  );
  const source = [
    ...new Set(
      [
        0,
        duration,
        current ?? NaN,
        ...timedSource,
        ...positions.flatMap(({ clip }) => [clip.start, clip.end]),
        ...captionItems(edit)
          .filter((cue) => !cue.timeSpace)
          .flatMap((cue) => [cue.start, cue.end]),
      ].filter(Number.isFinite),
    ),
  ];
  const output = [
    ...new Set([
      ...timedOutput,
      ...positions.flatMap((item) => [item.start, item.end]),
      ...source
        .filter((time) => positions.some(({ clip }) => time >= clip.start && time <= clip.end))
        .map((time) => outputTimeAtSource(edit, time)),
    ]),
  ];
  return { source, output };
}
/** Prefer nearby editorial landmarks over the frame grid; tolerance is supplied in timeline pixels. */
export function snapTime(
  value: number,
  targets: readonly number[],
  tolerance: number,
  frameRate?: number,
): number {
  if (!Number.isFinite(value) || !Number.isFinite(tolerance) || tolerance <= 0) return value;
  let nearest = value,
    distance = Infinity;
  for (const target of targets)
    if (Number.isFinite(target) && Math.abs(value - target) < distance) {
      distance = Math.abs(value - target);
      nearest = target;
    }
  if (distance <= tolerance) return nearest;
  if (frameRate && Number.isFinite(frameRate) && frameRate > 0) {
    const frame = Math.round(value * frameRate) / frameRate;
    if (Math.abs(frame - value) <= tolerance) return frame;
  }
  return value;
}
