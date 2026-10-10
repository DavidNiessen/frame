import { clipPositions, editClips, type TimelineClip } from './clips';
import { resizeSection } from './timeline-edit';
import type { EditSettings, TimeRange } from './types';

/** Joined bars retain their source pieces, so omitted footage never returns. */
export function clipGroups(edit: EditSettings) {
  const groups: { clips: TimelineClip[]; index: number; start: number; end: number; speed: number }[] = [];
  clipPositions(edit).forEach((position, index) => {
    const previous = groups.at(-1);
    if (position.clip.groupId && previous?.clips[0].groupId === position.clip.groupId) {
      previous.clips.push(position.clip); previous.end = position.end;
    } else groups.push({ clips: [position.clip], index, start: position.start, end: position.end, speed: position.speed });
  });
  return groups;
}
export function resizeClipGroup(edit: EditSettings, pieces: TimelineClip[], range: TimeRange, duration: number): Partial<EditSettings> {
  const clips = editClips(edit), first = pieces[0], last = pieces.at(-1)!;
  const left = resizeSection(edit, clips.findIndex(clip => clip.id === first.id), { start: range.start, end: first.end }, duration);
  const resized = { ...edit, ...left };
  return resizeSection(resized, clips.findIndex(clip => clip.id === last.id), { start: last.start, end: range.end }, duration);
}
