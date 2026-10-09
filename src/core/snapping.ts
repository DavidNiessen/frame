import { clipPositions } from './clips';
import { outputTimeAtSource } from './fades';
import type { EditSettings } from './types';
export type SnapSpace = 'source' | 'output';
export function snapTargets(edit: EditSettings, duration: number, current?: number): Record<SnapSpace, number[]> {
  const positions = clipPositions(edit);
  const source = [...new Set([0, duration, current ?? NaN, ...positions.flatMap(({ clip }) => [clip.start, clip.end]), ...edit.subtitles.cues.flatMap(cue => [cue.start, cue.end]), ...(edit.markers ?? []).map(marker => marker.time)].filter(Number.isFinite))];
  const output = [...new Set([...positions.flatMap(item => [item.start, item.end]), ...source.filter(time => positions.some(({ clip }) => time >= clip.start && time <= clip.end)).map(time => outputTimeAtSource(edit, time))])];
  return { source, output };
}
/** Prefer nearby editorial landmarks over the frame grid; tolerance is supplied in timeline pixels. */
export function snapTime(value: number, targets: readonly number[], tolerance: number, frameRate?: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(tolerance) || tolerance <= 0) return value;
  let nearest = value, distance = Infinity;
  for (const target of targets) if (Number.isFinite(target) && Math.abs(value - target) < distance) { distance = Math.abs(value - target); nearest = target; }
  if (distance <= tolerance) return nearest;
  if (frameRate && Number.isFinite(frameRate) && frameRate > 0) {
    const frame = Math.round(value * frameRate) / frameRate;
    if (Math.abs(frame - value) <= tolerance) return frame;
  }
  return value;
}
