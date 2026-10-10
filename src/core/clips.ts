import { definitionFor, effectiveSpeed, extraInstances } from './effect-instances';
import { timelineSections } from './timeline';
import type { EditSettings, TimeRange } from './types';
import { hasMinimumDuration } from './time-range';

export const clipEffectKeys = ['effectRanges', 'effectInstances', 'addedEffects', 'volume', 'speed', 'preservePitch', 'normalizeLoudness', 'targetLufs', 'reduceNoise', 'noiseStrength', 'noiseFloor', 'equalizer', 'audioFadeIn', 'audioFadeOut', 'videoFadeIn', 'videoFadeOut', 'color', 'geometry', 'crop'] as const;
export type ClipEffects = Partial<Pick<EditSettings, typeof clipEffectKeys[number]>>;
export interface TimelineClip extends TimeRange { id: string; effects: ClipEffects }
export function editClips(edit: EditSettings): TimelineClip[] {
  return edit.clips ?? timelineSections(edit).map(range => ({ ...range, id: `source-${range.start}-${range.end}`, effects: {} }));
}
/** Clip recipes inherit shared controls, while fades on the full output remain a final pass. */
export function clipRecipe(edit: EditSettings, clip: TimelineClip): EditSettings {
  return { ...edit, audioLayers: [], audioFadeIn: 0, audioFadeOut: 0, videoFadeIn: 0, videoFadeOut: 0, ...clip.effects,
    effectInstances: [...extraInstances(edit).filter(item => definitionFor(item.effect).scope === 'source'), ...(clip.effects.effectInstances ?? extraInstances(edit).filter(item => definitionFor(item.effect).scope === 'clip' && !item.effect.includes('Fade')))],
    start: clip.start, end: clip.end, clips: undefined, cuts: [], splits: [] };
}
export function clipAtSource(edit: EditSettings, time: number): TimelineClip | undefined {
  return editClips(edit).find(clip => time >= clip.start && time < clip.end) ?? editClips(edit).find(clip => time === clip.end);
}
export function clipPositions(edit: EditSettings) {
  let elapsed = 0;
  return editClips(edit).map(clip => {
    const start = elapsed, speed = effectiveSpeed(clipRecipe(edit, clip));
    elapsed += (clip.end - clip.start) / speed;
    return { clip, start, end: elapsed, speed };
  });
}
export function splitClip(edit: EditSettings, id: string, time: number): Partial<EditSettings> {
  const clips = editClips(edit), clip = clips.find(item => item.id === id);
  if (!clip || !hasMinimumDuration({ start: clip.start, end: time }, effectiveSpeed(clipRecipe(edit, clip))) || !hasMinimumDuration({ start: time, end: clip.end }, effectiveSpeed(clipRecipe(edit, clip)))) return {};
  return { clips: clips.flatMap(item => item.id === id ? [{ ...item, end: time }, { ...item, id: `source-${time}-${clip.end}`, start: time, effects: structuredClone(item.effects) }] : [item]) };
}
export function reorderClip(edit: EditSettings, id: string, index: number): Partial<EditSettings> {
  const clips = [...editClips(edit)], from = clips.findIndex(clip => clip.id === id);
  if (from < 0) return {};
  const [clip] = clips.splice(from, 1); clips.splice(Math.max(0, Math.min(clips.length, index)), 0, clip);
  return { clips };
}
export function patchClip(edit: EditSettings, id: string, patch: ClipEffects): Partial<EditSettings> {
  return { clips: editClips(edit).map(clip => {
    if (clip.id !== id) return clip;
    const inherited = clipRecipe(edit, { ...clip, effects: {} }), effects = { ...clip.effects, ...patch };
    for (const key of Object.keys(effects) as (keyof ClipEffects)[]) {
      if (JSON.stringify(key === 'addedEffects' ? effects[key] ?? [] : effects[key]) === JSON.stringify(key === 'addedEffects' ? inherited[key] ?? [] : inherited[key])) delete effects[key];
    }
    return { ...clip, effects };
  }) };
}
