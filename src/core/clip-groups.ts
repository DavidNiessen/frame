import { clipPositions, editClips, type TimelineClip } from './clips';
import { minimumSourceDuration } from './time-range';
import type { EditSettings, TimeRange } from './types';

/** Joined bars retain their source pieces, so omitted footage never returns. */
export function clipGroups(edit: EditSettings) {
  const groups: {
    clips: TimelineClip[];
    index: number;
    start: number;
    end: number;
    speed: number;
  }[] = [];
  clipPositions(edit).forEach((position, index) => {
    const previous = groups.at(-1);
    if (position.clip.groupId && previous?.clips[0].groupId === position.clip.groupId) {
      previous.clips.push(position.clip);
      previous.end = position.end;
    } else
      groups.push({
        clips: [position.clip],
        index,
        start: position.start,
        end: position.end,
        speed: position.speed,
      });
  });
  return groups;
}
/** Store the retained source before trimming so a removed edge can be restored across cuts. */
function joinedRanges(pieces: TimelineClip[]): TimeRange[] {
  return pieces[0].joinedRanges ?? pieces.map(({ start, end }) => ({ start, end }));
}
export function groupTrimState(edit: EditSettings, pieces: TimelineClip[], duration: number) {
  const all = editClips(edit),
    first = pieces[0],
    last = pieces.at(-1)!,
    ranges = joinedRanges(pieces).map((range) => ({ ...range }));
  const others = all.filter((clip) => !pieces.includes(clip));
  const start = Math.max(
    first.source?.start ?? 0,
    ...others.filter((clip) => clip.end <= ranges[0].start).map((clip) => clip.end),
  );
  const end = Math.min(
    last.source?.end ?? duration,
    ...others.filter((clip) => clip.start >= ranges.at(-1)!.end).map((clip) => clip.start),
  );
  ranges[0].start = Math.max(start, Math.min(ranges[0].start, first.start));
  ranges.at(-1)!.end = Math.min(end, Math.max(ranges.at(-1)!.end, last.end));
  let offset = 0,
    visibleStart = 0,
    visibleEnd = 0;
  for (const range of ranges) {
    if (first.start >= range.start && first.start < range.end)
      visibleStart = offset + first.start - range.start;
    if (last.end > range.start && last.end <= range.end)
      visibleEnd = offset + last.end - range.start;
    offset += range.end - range.start;
  }
  return {
    ranges,
    range: { start: visibleStart, end: visibleEnd },
    limits: { start: start - ranges[0].start, end: offset + end - ranges.at(-1)!.end },
  };
}
export function groupSlices(ranges: TimeRange[], range: TimeRange): TimeRange[] {
  let offset = 0;
  return ranges.flatMap((piece) => {
    const length = piece.end - piece.start,
      start = Math.max(0, range.start - offset),
      end = Math.min(length, range.end - offset);
    offset += length;
    return end > start + 1e-8 ? [{ start: piece.start + start, end: piece.start + end }] : [];
  });
}
/** The handle moves in retained time and can consume complete pieces at any internal cut. */
export function resizeClipGroup(
  edit: EditSettings,
  pieces: TimelineClip[],
  range: TimeRange,
  duration: number,
): Partial<EditSettings> {
  const state = groupTrimState(edit, pieces, duration),
    group = clipGroups(edit).find((group) => group.clips.includes(pieces[0]))!;
  const minimum = minimumSourceDuration(group.speed),
    start = Math.max(state.limits.start, Math.min(range.start, range.end - minimum)),
    end = Math.min(state.limits.end, Math.max(range.end, start + minimum));
  const ranges = state.ranges.map((piece) => ({ ...piece }));
  if (start < 0) ranges[0].start += start;
  const length = ranges.reduce((sum, piece) => sum + piece.end - piece.start, 0);
  if (end - Math.min(0, start) > length) ranges.at(-1)!.end += end - Math.min(0, start) - length;
  const kept = groupSlices(ranges, { start: Math.max(0, start), end: end - Math.min(0, start) });
  const replacements = kept.map((piece, index) => ({
    ...pieces[0],
    ...piece,
    id: index === 0 ? pieces[0].id : `${pieces[0].id.slice(0, 70)}-joined-${index}`,
    joinedRanges: ranges,
  }));
  if (!replacements.length) return {};
  return {
    clips: editClips(edit).flatMap((clip) =>
      clip.id === pieces[0].id ? replacements : pieces.includes(clip) ? [] : [clip],
    ),
  };
}
