import { effectiveSpeed } from './effect-instances';
import { editedDuration, timelineSections } from './timeline';
import type { EditSettings, TimeRange } from './types';
import { minimumSection, minimumSourceDuration, timeEpsilon } from './time-range';
export { minimumSection } from './time-range';
export type Boundary = 'start' | 'end';
export function sectionLimits(edit: EditSettings, index: number, duration: number): TimeRange {
  if (edit.clips) {
    const clip = edit.clips[index];
    if (!clip) return { start: 0, end: duration };
    const other = edit.clips.filter((_, i) => i !== index);
    return { start: Math.max(0, ...other.filter(c => c.end <= clip.start + timeEpsilon).map(c => c.end)), end: Math.min(duration, ...other.filter(c => c.start >= clip.end - timeEpsilon).map(c => c.start)) };
  }
  const sections = timelineSections(edit);
  return { start: sections[index - 1]?.end ?? 0, end: sections[index + 1]?.start ?? duration };
}
/** Rebuild cuts and split markers from retained sections without moving neighbouring clips. */
export function resizeSection(edit: EditSettings, index: number, range: TimeRange, duration: number): Partial<EditSettings> {
  const sections = timelineSections(edit), original = sections[index];
  if (!original || !Number.isFinite(range.start) || !Number.isFinite(range.end)) return {};
  const limits = sectionLimits(edit, index, duration);
  const minimum = minimumSourceDuration(effectiveSpeed({ ...edit, ...edit.clips?.[index].effects }));
  const start = Math.max(limits.start, Math.min(original.end - minimum, range.start));
  const end = Math.min(limits.end, Math.max(start + minimum, range.end));
  sections[index] = { start, end };
  if (edit.clips) return { clips: edit.clips.map((clip, i) => i === index ? { ...clip, start, end } : clip) };
  const cuts = sections.slice(1).flatMap((section, i) => section.start > sections[i].end
    ? [{ start: sections[i].end, end: section.start }] : []);
  const patch = { start: sections[0].start, end: sections.at(-1)!.end, cuts, splits: sections.slice(0, -1).map(s => s.end) };
  if (editedDuration({ ...edit, ...patch }) + timeEpsilon < minimumSection) return {};
  return patch;
}
