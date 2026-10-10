import { definitionFor, extraInstances, instanceLimit, newInstance, primaryPresent } from './effect-instances';
import { clipRecipe, editClips, patchClip } from './clips';
import { availableEffects, resetEffect, type EffectDefinition } from './effect-library';
import { type EffectId } from './effect-ids';
import type { EditSettings, MediaAsset } from './types';
export type EffectAction = 'add' | 'reset' | 'remove';
function membership(recipe: EditSettings, effect: EffectDefinition, action: EffectAction): EffectId[] {
  const ids = recipe.addedEffects ?? [];
  if (action === 'remove') return ids.filter(id => id !== effect.id);
  return !ids.includes(effect.id) ? [...ids, effect.id] : ids;
}
/** All UI entry points share one undoable, clip-scoped application/removal operation. */
export function effectAction(edit: EditSettings, asset: MediaAsset, effect: EffectDefinition, selectedClip: string | null, action: EffectAction, current?: number): Partial<EditSettings> {
  const instanceId = action === 'add' ? crypto.randomUUID() : '';
  function patch(recipe: EditSettings): Partial<EditSettings> {
    if (action === 'add') {
      if (extraInstances(recipe).length >= instanceLimit) throw new Error(`Use up to ${instanceLimit} effects per target.`);
      const instance = newInstance(recipe, asset, effect.id, instanceId, current);
      if (primaryPresent(recipe, asset, effect.id)) return { effectInstances: [...extraInstances(recipe), instance] };
      return { ...instance.settings, addedEffects: membership(recipe, effect, action) };
    }
    const values = resetEffect(effect, asset);
    return { ...values, addedEffects: membership(recipe, effect, action) };
  }
  if (effect.scope === 'source') return patch(edit);
  const clip = editClips(edit).find(item => item.id === selectedClip);
  if (clip) { const local = patch(clipRecipe(edit, clip)); if (local.effectInstances) local.effectInstances = local.effectInstances.filter(instance => definitionFor(instance.effect).scope === 'clip'); return patchClip(edit, clip.id, local); }
  const shared = patch(edit);
  return { ...shared, ...(edit.clips ? { clips: edit.clips.map(item => {
    const recipe = clipRecipe(edit, item), effects = { ...item.effects };
    if (action !== 'add') for (const key of effect.keys) delete effects[key as keyof typeof effects];
    const local = patch(recipe);
    if (action === 'add') { effects.addedEffects = local.addedEffects ?? recipe.addedEffects; if (local.effectInstances && !effect.id.includes('Fade')) effects.effectInstances = local.effectInstances; }
    else Object.assign(effects, local);
    if (effects.effectInstances) effects.effectInstances = effects.effectInstances.filter(item => definitionFor(item.effect).scope === 'clip');
    return { ...item, effects };
  }) } : {}) };
}
export function clearClipEffects(edit: EditSettings, asset: MediaAsset, selectedClip: string | null): Partial<EditSettings> {
  let next = edit;
  for (const effect of availableEffects(asset).filter(effect => effect.scope === 'clip')) next = { ...next, ...effectAction(next, asset, effect, selectedClip, 'remove') };
  if (selectedClip) { const clip = editClips(next).find(item => item.id === selectedClip); if (clip) next = { ...next, ...patchClip(next, clip.id, { effectInstances: [] }) }; }
  else next = { ...next, effectInstances: extraInstances(next).filter(item => definitionFor(item.effect).scope === 'source'), ...(next.clips ? { clips: next.clips.map(clip => ({ ...clip, effects: { ...clip.effects, effectInstances: [] } })) } : {}) };
  return next;
}
export const effectDragType = 'application/x-frame-effect';
