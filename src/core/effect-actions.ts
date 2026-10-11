import {
  captionLimit,
  definitionFor,
  extraInstances,
  instanceLimit,
  newInstance,
  primaryPresent,
} from './effect-instances';
import { clipRecipe, editClips, patchClip } from './clips';
import { availableEffects, resetEffect, type EffectDefinition } from './effect-library';
import { type EffectId } from './effect-ids';
import { isTimedAdjustment } from './timed-adjustments';
import type { EditSettings, MediaAsset } from './types';
export type EffectAction = 'add' | 'reset' | 'remove';
function membership(
  recipe: EditSettings,
  effect: EffectDefinition,
  action: EffectAction,
): EffectId[] {
  const ids = recipe.addedEffects ?? [];
  if (action === 'remove') return ids.filter((id) => id !== effect.id);
  return !ids.includes(effect.id) ? [...ids, effect.id] : ids;
}
/** Reuse one adjustment per target; legacy stacks remain editable without creating more. */
export function existingEffectTarget(
  edit: EditSettings,
  asset: MediaAsset,
  effect: EffectDefinition,
  selectedClip: string | null,
): { clipId: string | null; instanceId?: string } | null {
  if (effect.repeatable) return null;
  const locate = (recipe: EditSettings, clipId: string | null) =>
    primaryPresent(recipe, asset, effect.id)
      ? { clipId }
      : extraInstances(recipe, effect.id)[0]
        ? { clipId, instanceId: extraInstances(recipe, effect.id)[0].id }
        : null;
  if (effect.scope === 'source') return locate(edit, null);
  const clips = editClips(edit),
    clip = clips.find((item) => item.id === selectedClip);
  if (clip) return locate(clipRecipe(edit, clip), clip.id);
  return (
    locate(edit, null) ??
    clips.map((clip) => locate(clipRecipe(edit, clip), clip.id)).find(Boolean) ??
    null
  );
}
/** Backward-compatible primary/source controls and removal of older clip adjustments. */
export function effectAction(
  edit: EditSettings,
  asset: MediaAsset,
  effect: EffectDefinition,
  selectedClip: string | null,
  action: EffectAction,
  current?: number,
): Partial<EditSettings> {
  if (action === 'add' && existingEffectTarget(edit, asset, effect, selectedClip)) return {};
  const instanceId = action === 'add' ? crypto.randomUUID() : '';
  function patch(recipe: EditSettings): Partial<EditSettings> {
    if (action === 'add') {
      if (effect.id === 'captions') {
        const count =
          recipe.subtitles.cues.length +
          extraInstances(recipe, 'captions').reduce(
            (sum, instance) => sum + (instance.settings.subtitles?.cues.length ?? 0),
            0,
          );
        if (count >= captionLimit)
          throw new Error(`Use up to ${captionLimit.toLocaleString('en-US')} captions per source.`);
      } else if (
        extraInstances(recipe).filter((instance) => instance.effect !== 'captions').length >=
        instanceLimit
      )
        throw new Error(`Use up to ${instanceLimit} effects per target.`);
      const instance = newInstance(recipe, asset, effect.id, instanceId, current);
      if (primaryPresent(recipe, asset, effect.id))
        return { effectInstances: [...extraInstances(recipe), instance] };
      return {
        ...instance.settings,
        ...(isTimedAdjustment(effect.id) && instance.range
          ? { effectRanges: { ...recipe.effectRanges, [effect.id]: instance.range } }
          : {}),
        addedEffects: membership(recipe, effect, action),
      };
    }
    const values = resetEffect(effect, asset);
    const effectRanges = { ...recipe.effectRanges };
    if (action === 'remove' && isTimedAdjustment(effect.id)) delete effectRanges[effect.id];
    return {
      ...values,
      ...(recipe.effectRanges ? { effectRanges } : {}),
      addedEffects: membership(recipe, effect, action),
    };
  }
  if (effect.scope === 'source') return patch(edit);
  const clip = editClips(edit).find((item) => item.id === selectedClip);
  if (clip) {
    const local = patch(clipRecipe(edit, clip));
    if (local.effectInstances)
      local.effectInstances = local.effectInstances.filter(
        (instance) => !instance.timeSpace && definitionFor(instance.effect).scope === 'clip',
      );
    return patchClip(edit, clip.id, local);
  }
  const shared = patch(edit);
  return {
    ...shared,
    ...(edit.clips
      ? {
          clips: edit.clips.map((item) => {
            const recipe = clipRecipe(edit, item),
              effects = { ...item.effects };
            if (action !== 'add')
              for (const key of effect.keys) delete effects[key as keyof typeof effects];
            const local = patch(recipe);
            if (action === 'add') {
              effects.addedEffects = local.addedEffects ?? recipe.addedEffects;
              if (local.effectRanges)
                effects.effectRanges = shared.effectRanges ?? local.effectRanges;
              if (local.effectInstances && !effect.id.includes('Fade'))
                effects.effectInstances = local.effectInstances.map((instance) =>
                  instance.id === instanceId
                    ? (shared.effectInstances?.find((item) => item.id === instanceId) ?? instance)
                    : instance,
                );
            } else Object.assign(effects, local);
            if (effects.effectInstances)
              effects.effectInstances = effects.effectInstances.filter(
                (item) => !item.timeSpace && definitionFor(item.effect).scope === 'clip',
              );
            return { ...item, effects };
          }),
        }
      : {}),
  };
}
export function clearClipEffects(
  edit: EditSettings,
  asset: MediaAsset,
  selectedClip: string | null,
): Partial<EditSettings> {
  let next = edit;
  for (const effect of availableEffects(asset).filter((effect) => effect.scope === 'clip'))
    next = { ...next, ...effectAction(next, asset, effect, selectedClip, 'remove') };
  if (selectedClip) {
    const clip = editClips(next).find((item) => item.id === selectedClip);
    if (clip) next = { ...next, ...patchClip(next, clip.id, { effectInstances: [] }) };
  } else
    next = {
      ...next,
      effectInstances: extraInstances(next).filter(
        (item) => definitionFor(item.effect).scope === 'source',
      ),
      ...(next.clips
        ? {
            clips: next.clips.map((clip) => ({
              ...clip,
              effects: { ...clip.effects, effectInstances: [] },
            })),
          }
        : {}),
    };
  return next;
}
export const effectDragType = 'application/x-frame-effect';
