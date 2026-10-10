import { extraInstances } from './effect-instances';
import type { EditSettings } from './types';
import type { ClipEffects, TimelineClip } from './clips';

/** Older clip fades become track effects before a split, preserving their original endpoints. */
export function preserveSplitFades(edit: EditSettings, clip: TimelineClip, outputStart: number, speed: number) {
  const effects: ClipEffects = structuredClone(clip.effects), instances = [...extraInstances(edit)];
  const outputEnd = outputStart + (clip.end - clip.start) / speed;
  const place = (key: 'audioFadeIn' | 'audioFadeOut' | 'videoFadeIn' | 'videoFadeOut', value: number, id: string) => {
    if (instances.some(instance => instance.id === id)) return;
    const length = Math.min(value || .5, outputEnd - outputStart);
    instances.push({ id, effect: key, timeSpace: 'output', range: key.endsWith('In') ? { start: outputStart, end: outputStart + length } : { start: outputEnd - length, end: outputEnd }, settings: { [key]: value } });
  };
  for (const key of ['audioFadeIn', 'audioFadeOut', 'videoFadeIn', 'videoFadeOut'] as const) {
    if (effects[key] !== undefined && (effects[key]! > 0 || effects.addedEffects?.includes(key))) {
      // Inherited shared fades already run once after the full sequence is joined.
      if (!(edit[key] > 0 && edit[key] === effects[key] && edit.addedEffects?.includes(key))) place(key, effects[key]!, crypto.randomUUID());
      delete effects[key]; effects.addedEffects = effects.addedEffects?.filter(id => id !== key);
    }
  }
  if (effects.effectInstances) effects.effectInstances = effects.effectInstances.filter(instance => {
    if (!instance.effect.includes('Fade')) return true;
    place(instance.effect as 'audioFadeOut', Number(instance.settings[instance.effect as 'audioFadeOut'] ?? 0), instance.id); return false;
  });
  return { effects, instances };
}
