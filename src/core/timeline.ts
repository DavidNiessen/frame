import { effectiveSpeed } from './effect-instances';
import type { EditSettings, TimeRange } from './types';

export function keptRanges(edit: Pick<EditSettings, 'start' | 'end' | 'cuts'> & Partial<Pick<EditSettings, 'clips'>>): TimeRange[] {
  if (edit.clips) return edit.clips.map(({ start, end }) => ({ start, end }));
  const cuts = edit.cuts.map(c => ({ start: Math.max(edit.start, c.start), end: Math.min(edit.end, c.end) }))
    .filter(c => c.end > c.start).sort((a, b) => a.start - b.start);
  const ranges: TimeRange[] = [];
  let cursor = edit.start;
  for (const cut of cuts) {
    if (cut.start > cursor) ranges.push({ start: cursor, end: cut.start });
    cursor = Math.max(cursor, cut.end);
  }
  if (cursor < edit.end) ranges.push({ start: cursor, end: edit.end });
  return ranges;
}
export function editedDuration(edit: Pick<EditSettings, 'start' | 'end' | 'cuts'> & Partial<Pick<EditSettings, 'clips'>> & Partial<Pick<EditSettings, 'speed' | 'effectInstances'>>): number {
  if (edit.clips) return edit.clips.reduce((total, clip) => total + (clip.end - clip.start) / effectiveSpeed({ ...edit, ...clip.effects, effectInstances: [...(edit.effectInstances ?? []).filter(item => item.timeSpace === 'output'), ...(clip.effects.effectInstances ?? edit.effectInstances ?? []).filter(item => !item.timeSpace)] }), 0);
  return keptRanges(edit).reduce((total, range) => total + range.end - range.start, 0) / effectiveSpeed(edit);
}
export function timelineSections(edit: EditSettings): TimeRange[] {
  if (edit.clips) return edit.clips.map(({ start, end }) => ({ start, end }));
  return keptRanges(edit).flatMap(range => {
    const points = [range.start, ...edit.splits.filter(s => s > range.start && s < range.end).sort((a, b) => a - b), range.end];
    return points.slice(0, -1).map((start, i) => ({ start, end: points[i + 1] }));
  });
}
export function nextPlayableTime(edit: EditSettings, current: number): number | null {
  if (edit.clips) {
    const currentClip = edit.clips.find(clip => current >= clip.start && current < clip.end - .015);
    return currentClip ? current : edit.clips[0]?.start ?? null;
  }
  for (const range of keptRanges(edit)) {
    if (current < range.start) return range.start;
    if (current < range.end - 0.015) return current;
  }
  return null;
}
