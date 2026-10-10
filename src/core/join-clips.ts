import { editClips, type TimelineClip } from './clips';
import { clipGroups } from './clip-groups';
import type { EditSettings } from './types';

function sameValues(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  return Object.keys(left).length === Object.keys(right).length && Object.keys(left).every(key => Object.hasOwn(right, key) && sameValues(left[key], right[key]));
}
function boundaryEffects(clip: TimelineClip) {
  return ['audioFadeIn', 'audioFadeOut', 'videoFadeIn', 'videoFadeOut'].some(key => Number(clip.effects[key as 'audioFadeIn']) > 0)
    || clip.effects.normalizeLoudness === true
    || clip.effects.effectInstances?.some(instance => instance.effect.includes('Fade') || instance.effect === 'normalize');
}
function canJoin(left: TimelineClip[], right?: TimelineClip[]) {
  const pieces = [...left, ...(right ?? [])];
  return !!right && pieces.every((clip, index) => sameValues(left[0].effects, clip.effects) && !boundaryEffects(clip) && (!index || clip.start >= pieces[index - 1].end - .000001));
}
/** Adjacent retained footage may join even when a deleted source gap separates it. */
export function adjacentSplitJoin(edit: EditSettings, selectedId: string | null) {
  const groups = clipGroups(edit), index = groups.findIndex(group => group.clips.some(clip => clip.id === selectedId));
  if (index < 0) return null;
  const left = canJoin(groups[index].clips, groups[index + 1]?.clips) ? index : index > 0 && canJoin(groups[index - 1].clips, groups[index].clips) ? index - 1 : -1;
  if (left < 0) return null;
  return { left: groups[left].clips[0], right: groups[left + 1].clips[0], pieces: [...groups[left].clips, ...groups[left + 1].clips] };
}
export function joinSplitClips(edit: EditSettings, selectedId: string | null): Partial<EditSettings> {
  const pair = adjacentSplitJoin(edit, selectedId);
  if (!pair) return {};
  const continuous = pair.pieces.every((clip, index) => !index || Math.abs(pair.pieces[index - 1].end - clip.start) < .000001);
  const source = pair.pieces.every(clip => sameValues(clip.source, pair.left.source)) ? pair.left.source : undefined;
  if (continuous) return { clips: editClips(edit).flatMap(clip => clip.id === pair.left.id ? [{ ...clip, source, groupId: undefined, joinedRanges: undefined, end: pair.pieces.at(-1)!.end }] : pair.pieces.some(piece => piece.id === clip.id) ? [] : [clip]) };
  const groupId = pair.left.groupId ?? crypto.randomUUID();
  const joinedRanges = pair.pieces.map(({ start, end }) => ({ start, end }));
  return { clips: editClips(edit).map(clip => pair.pieces.some(piece => piece.id === clip.id) ? { ...clip, source, groupId, joinedRanges } : clip) };
}
