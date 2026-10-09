import { editedDuration, keptRanges } from './timeline';
import type { EditSettings } from './types';
export function outputTimeAtSource(edit: EditSettings, sourceTime: number): number {
  return keptRanges(edit).reduce((time, range) => time + Math.max(0, Math.min(sourceTime, range.end) - range.start), 0) / edit.speed;
}
export function fadeGain(time: number, duration: number, fadeIn: number, fadeOut: number): number {
  const incoming = fadeIn ? Math.max(0, Math.min(1, time / fadeIn)) : 1;
  const outgoing = fadeOut ? Math.max(0, Math.min(1, (duration - time) / fadeOut)) : 1;
  return incoming * outgoing;
}
export function fadeFilters(edit: EditSettings, kind: 'audio' | 'video'): string[] {
  const fadeIn = kind === 'audio' ? edit.audioFadeIn : edit.videoFadeIn;
  const fadeOut = kind === 'audio' ? edit.audioFadeOut : edit.videoFadeOut;
  const filter = kind === 'audio' ? 'afade' : 'fade';
  return [...(fadeIn ? [`${filter}=t=in:st=0:d=${fadeIn}`] : []), ...(fadeOut ? [`${filter}=t=out:st=${editedDuration(edit) - fadeOut}:d=${fadeOut}`] : [])];
}
/** Map output seconds back onto the retained source; choose a side at cut boundaries. */
export function sourceTimeAtOutput(edit: EditSettings, output: number, side: 'start' | 'end' = 'start'): number {
  const ranges = keptRanges(edit); let remaining = Math.max(0, Math.min(editedDuration(edit), output)) * edit.speed;
  for (const range of ranges) {
    const length = range.end - range.start;
    if (remaining < length || side === 'end' && remaining <= length) return range.start + remaining;
    remaining -= length;
  }
  return ranges.at(-1)?.end ?? edit.end;
}
