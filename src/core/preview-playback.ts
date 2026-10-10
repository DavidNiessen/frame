import { editClips } from './clips';
import { nextPlayableTime } from './timeline';
import type { EditSettings } from './types';

/** Contiguous splits share a decoder: changing clip identity must not seek the source. */
export function previewPlaybackStep(edit: EditSettings, current: number, activeId: string | null) {
  if (!edit.clips) return { time: nextPlayableTime(edit, current), clipId: null };
  const clips = editClips(edit);
  let index = clips.findIndex(clip => clip.id === activeId);
  if (index < 0 || current < clips[index].start) index = clips.findIndex(clip => current >= clip.start && current < clip.end);
  if (index < 0) index = 0;
  while (clips[index]) {
    const clip = clips[index], next = clips[index + 1];
    if (next && Math.abs(next.start - clip.end) < .000001) {
      if (current >= clip.end) { index++; continue; }
      return { time: current, clipId: clip.id };
    }
    // Seek only across a real gap/reordering, or when reaching the end.
    if (current >= clip.end - .015) return { time: next?.start ?? null, clipId: next?.id ?? null };
    return { time: current, clipId: clip.id };
  }
  return { time: null, clipId: null };
}
