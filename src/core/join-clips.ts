import { editClips, type TimelineClip } from './clips';
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
function canJoin(left: TimelineClip, right?: TimelineClip) {
  return !!right && Math.abs(left.end - right.start) < .000001 && sameValues(left.effects, right.effects) && !boundaryEffects(left) && !boundaryEffects(right);
}
/** Join only consecutive source footage; a deleted gap or distinct legacy treatment stays intact. */
export function adjacentSplitJoin(edit: EditSettings, selectedId: string | null) {
  const clips = editClips(edit), index = clips.findIndex(clip => clip.id === selectedId);
  if (index < 0) return null;
  if (canJoin(clips[index], clips[index + 1])) return { left: clips[index], right: clips[index + 1] };
  if (index > 0 && canJoin(clips[index - 1], clips[index])) return { left: clips[index - 1], right: clips[index] };
  return null;
}
export function joinSplitClips(edit: EditSettings, selectedId: string | null): Partial<EditSettings> {
  const pair = adjacentSplitJoin(edit, selectedId);
  if (!pair) return {};
  return { clips: editClips(edit).filter(clip => clip.id !== pair.right.id).map(clip => clip.id === pair.left.id ? { ...clip, end: pair.right.end } : clip) };
}
