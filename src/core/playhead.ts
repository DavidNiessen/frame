import { clipPositions } from './clips';
import { outputTimeAtSource, sourceTimeAtOutput } from './fades';
import { editedDuration } from './timeline';
import type { EditSettings } from './types';

/** Step source frames in sequence order, including across removed or reordered footage. */
export function stepFrame(
  edit: EditSettings,
  source: number,
  rate: number,
  direction: -1 | 1,
): number {
  const fps = Number.isFinite(rate) && rate > 0 ? rate : 30;
  const positions = clipPositions(edit);
  const index = positions.findIndex(({ clip }) => source >= clip.start && source < clip.end);
  if (index < 0 && source === positions.at(-1)?.clip.end)
    return Math.max(positions.at(-1)!.clip.start, (Math.ceil(source * fps - 1e-6) - 1) / fps);
  if (index < 0)
    return direction > 0
      ? positions[0].clip.start
      : Math.max(
          positions.at(-1)!.clip.start,
          (Math.ceil(positions.at(-1)!.clip.end * fps - 1e-6) - 1) / fps,
        );
  const clip = positions[index].clip;
  // Media elements round currentTime to microseconds. Tolerate that rounding at frame boundaries.
  const epsilon = Math.max(1e-6, fps * 0.000002);
  const candidate =
    (direction > 0
      ? Math.floor(source * fps + epsilon) + 1
      : Math.ceil(source * fps - epsilon) - 1) / fps;
  if (direction > 0 && candidate >= clip.end - 1e-7)
    return (
      positions[index + 1]?.clip.start ??
      Math.max(clip.start, (Math.ceil(clip.end * fps - 1e-6) - 1) / fps)
    );
  if (direction < 0 && candidate < clip.start) {
    const previous = positions[index - 1]?.clip;
    return previous
      ? Math.max(previous.start, (Math.ceil(previous.end * fps - 1e-6) - 1) / fps)
      : clip.start;
  }
  return Math.max(clip.start, candidate);
}
export function skipSeconds(edit: EditSettings, source: number, seconds: number): number {
  return sourceTimeAtOutput(
    edit,
    Math.max(0, Math.min(editedDuration(edit), outputTimeAtSource(edit, source) + seconds)),
  );
}
export function parseTimecode(value: string, maximum: number): number {
  const text = value.trim();
  if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d{1,6})?$/.test(text))
    throw new Error('Use seconds, m:ss, or h:mm:ss with optional decimals.');
  const parts = text.split(':').map(Number);
  if (parts.length > 1 && parts.slice(1).some((part) => part >= 60))
    throw new Error('Minutes and seconds after a colon must be below 60.');
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  if (!Number.isFinite(seconds) || seconds > maximum)
    throw new Error('That position is beyond the end of the sequence.');
  return seconds;
}
export function preciseTimecode(seconds: number): string {
  const millis = Math.round(Math.max(0, seconds) * 1000),
    hours = Math.floor(millis / 3600000),
    minutes = Math.floor(millis / 60000) % 60;
  const remainder = ((millis % 60000) / 1000).toFixed(3).padStart(6, '0');
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${remainder}`
    : `${minutes}:${remainder}`;
}
