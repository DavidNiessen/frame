import { effectLibrary, effectActive, enableEffect } from './effect-library';
import { clipRecipe, editClips, patchClip } from './clips';
import { defaultSettings, type EditSettings, type MediaAsset } from './types';
import type { EffectId } from './effect-ids';

/** The first instance uses legacy recipe fields; additional instances own their parameters. */
export interface EffectInstance { id: string; effect: EffectId; settings: Partial<EditSettings> }
export const instanceLimit = 128;
export const captionLimit = 1000;
export const definitionFor = (id: EffectId) => effectLibrary.find(effect => effect.id === id)!;
export const extraInstances = (edit: Pick<EditSettings, 'effectInstances'>, id?: EffectId) => (edit.effectInstances ?? []).filter(instance => !id || instance.effect === id);
export const primaryPresent = (edit: EditSettings, asset: MediaAsset, id: EffectId) => !!edit.addedEffects?.includes(id) || effectActive(definitionFor(id), edit, asset);
export function instanceRecipe(edit: EditSettings, instance: EffectInstance): EditSettings {
  const asset: MediaAsset = { id: '', name: '', size: 0, kind: 'video', hasAudio: true, duration: edit.end, previewUrl: '' };
  const defaults = defaultSettings(asset), keys = definitionFor(instance.effect).keys;
  const context = definitionFor(instance.effect).scope === 'source' ? extraInstances(edit).filter(item => definitionFor(item.effect).scope === 'clip') : [];
  return { ...edit, ...Object.fromEntries(keys.map(key => [key, defaults[key]])), ...instance.settings, effectInstances: context.length ? context : undefined };
}
export function newInstance(edit: EditSettings, asset: MediaAsset, id: EffectId, key: string = crypto.randomUUID(), current = edit.start): EffectInstance {
  const defaults = defaultSettings(asset), effect = definitionFor(id);
  const settings: Partial<EditSettings> = { ...Object.fromEntries(effect.keys.map(key => [key, defaults[key]])), ...enableEffect(effect, edit) };
  if (id === 'watermark') {
    const start = Math.max(edit.start, Math.min(current, edit.end - .05));
    settings.overlays = { ...defaults.overlays, range: { start, end: Math.min(edit.end, start + 2) } };
  }
  if (id === 'captions') {
    const start = Math.max(edit.start, Math.min(current, edit.end - .05));
    settings.subtitles = { mode: edit.subtitles.mode === 'none' ? 'burn' : edit.subtitles.mode, cues: [{ start, end: Math.min(edit.end, start + 2), text: 'New caption' }] };
  }
  return { id: key, effect: id, settings };
}
export function scopedInstances(edit: EditSettings, selectedClip: string | null) {
  const clip = editClips(edit).find(item => item.id === selectedClip);
  return extraInstances(clip ? clipRecipe(edit, clip) : edit);
}
/** One edit operation preserves unrelated instances, including per-clip overrides. */
export function changeInstance(edit: EditSettings, id: string, selectedClip: string | null, values: Partial<EditSettings> | 'remove'): Partial<EditSettings> {
  const instance = scopedInstances(edit, selectedClip).find(item => item.id === id) ?? edit.clips?.flatMap(clip => extraInstances(clipRecipe(edit, clip))).find(item => item.id === id);
  if (!instance) return {};
  const effect = definitionFor(instance.effect), keys = effect.keys;
  const patch = typeof values === 'string' ? {} : Object.fromEntries(Object.entries(values).filter(([key]) => keys.includes(key as keyof EditSettings)));
  const others = typeof values === 'string' ? {} : Object.fromEntries(Object.entries(values).filter(([key]) => !keys.includes(key as keyof EditSettings)));
  const change = (recipe: EditSettings) => [...extraInstances(recipe), ...(values !== 'remove' && !extraInstances(recipe).some(item => item.id === id) ? [instance] : [])].flatMap(item => item.id !== id ? [item] : values === 'remove' ? [] : [{ ...item, settings: { ...item.settings, ...patch } }]);
  if (effect.scope === 'source') return { ...others, effectInstances: change(edit) };
  const clip = editClips(edit).find(item => item.id === selectedClip);
  if (clip) return { ...others, ...patchClip(edit, clip.id, { effectInstances: change(clipRecipe(edit, clip)).filter(item => definitionFor(item.effect).scope === 'clip') }) };
  return { ...others, effectInstances: change(edit), ...(edit.clips ? { clips: edit.clips.map(clip => ({ ...clip, effects: { ...clip.effects, effectInstances: effect.id.includes('Fade') ? extraInstances(clipRecipe(edit, clip)).filter(item => definitionFor(item.effect).scope === 'clip' && item.id !== id) : change(clipRecipe(edit, clip)).filter(item => definitionFor(item.effect).scope === 'clip') } })) } : {}) };
}
export function effectiveVolume(edit: Partial<Pick<EditSettings, 'volume' | 'effectInstances'>>) {
  return extraInstances(edit, 'volume').reduce((gain, instance) => gain * (instance.settings.volume ?? 1), edit.volume ?? 1);
}
export function effectiveSpeed(edit: Partial<Pick<EditSettings, 'speed' | 'effectInstances'>>) {
  return extraInstances(edit, 'speed').reduce((speed, instance) => speed * (instance.settings.speed ?? 1), edit.speed ?? 1);
}
export function sourceRecipes(edit: EditSettings, id: EffectId): { id?: string; recipe: EditSettings }[] {
  return [{ recipe: { ...edit, effectInstances: extraInstances(edit).filter(item => definitionFor(item.effect).scope === 'clip') } }, ...extraInstances(edit, id).map(instance => ({ id: instance.id, recipe: instanceRecipe(edit, instance) }))];
}
export function allAudioLayers(edit: EditSettings) { return sourceRecipes(edit, 'mix').flatMap(({ recipe }) => recipe.audioLayers ?? []); }
export function updateAudioLayers(edit: EditSettings, layers: EditSettings['audioLayers']): Partial<EditSettings> {
  const next = layers ?? [], primaryIds = new Set((edit.audioLayers ?? []).map(layer => layer.id));
  return { audioLayers: next.filter(layer => primaryIds.has(layer.id)), effectInstances: extraInstances(edit).map(instance => instance.effect === 'mix' ? { ...instance, settings: { ...instance.settings, audioLayers: next.filter(layer => instance.settings.audioLayers?.some(item => item.id === layer.id)) } } : instance) };
}
