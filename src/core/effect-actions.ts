import { clipRecipe, editClips, patchClip } from './clips';
import { availableEffects, effectActive, enableEffect, resetEffect, type EffectDefinition } from './effect-library';
import { intrinsicEffects, type EffectId } from './effect-ids';
import type { EditSettings, MediaAsset } from './types';
export type EffectAction = 'add' | 'reset' | 'remove';
function membership(recipe: EditSettings, effect: EffectDefinition, action: EffectAction): EffectId[] {
  const ids = recipe.addedEffects ?? [];
  if (action === 'remove') return ids.filter(id => id !== effect.id);
  return !intrinsicEffects.includes(effect.id) && !ids.includes(effect.id) ? [...ids, effect.id] : ids;
}
/** All UI entry points share one undoable, clip-scoped application/removal operation. */
export function effectAction(edit: EditSettings, asset: MediaAsset, effect: EffectDefinition, selectedClip: string | null, action: EffectAction): Partial<EditSettings> {
  function patch(recipe: EditSettings) {
    const values = action === 'add' ? effectActive(effect, recipe, asset) ? {} : enableEffect(effect, recipe) : resetEffect(effect, asset);
    return { ...values, addedEffects: membership(recipe, effect, action) };
  }
  if (effect.scope === 'source') return patch(edit);
  const clip = editClips(edit).find(item => item.id === selectedClip);
  if (clip) return patchClip(edit, clip.id, patch(clipRecipe(edit, clip)));
  const shared = patch(edit);
  return { ...shared, ...(edit.clips ? { clips: edit.clips.map(item => {
    const recipe = clipRecipe(edit, item), effects = { ...item.effects };
    if (action !== 'add') for (const key of effect.keys) delete effects[key as keyof typeof effects];
    effects.addedEffects = membership(recipe, effect, action);
    return { ...item, effects };
  }) } : {}) };
}
export function clearClipEffects(edit: EditSettings, asset: MediaAsset, selectedClip: string | null): Partial<EditSettings> {
  let next = edit;
  for (const effect of availableEffects(asset).filter(effect => effect.scope === 'clip')) next = { ...next, ...effectAction(next, asset, effect, selectedClip, 'remove') };
  return next;
}
export const effectDragType = 'application/x-frame-effect';
