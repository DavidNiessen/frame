import { extraInstances, instanceRecipe, primaryPresent } from './effect-instances';
import { clipPositions, clipRecipe } from './clips';
import { availableEffects } from './effect-library';
import { isTimedAdjustment } from './timed-adjustments';
import type { EditSettings, MediaAsset } from './types';
/** Legacy clip-owned effects; new track instances have independent rows and output timing. */
export function clipEffectRows(asset: MediaAsset, edit: EditSettings) {
  const positions = clipPositions(edit).map((position, index) => { const recipe = clipRecipe(edit, position.clip); return { ...position, index, recipe: { ...recipe, effectInstances: extraInstances(recipe).filter(item => !item.timeSpace) } }; });
  return availableEffects(asset).filter(effect => effect.scope === 'clip').flatMap(effect => {
    const intersects = (recipe: EditSettings) => { const range = isTimedAdjustment(effect.id) ? recipe.effectRanges?.[effect.id] : undefined; return !range || range.start < recipe.end && range.end > recipe.start; };
    const items = positions.filter(({ recipe }) => {
      if (!intersects(recipe)) return false;
      if (effect.id.includes('Fade')) return recipe[effect.id as 'audioFadeIn'] > 0 || recipe.addedEffects?.includes(effect.id) && !edit[effect.id as 'audioFadeIn'];
      return primaryPresent(recipe, asset, effect.id);
    }).map(item => ({ ...item, instanceId: undefined as string | undefined, ordinal: 1 }));
    const count = Math.max(0, ...positions.map(({ recipe }) => extraInstances(recipe, effect.id).length));
    return [{ key: effect.id, effect, items }, ...Array.from({ length: count }, (_, index) => ({ key: `${effect.id}-${index + 2}`, effect, items: positions.flatMap(item => {
      const instance = extraInstances(item.recipe, effect.id)[index];
      if (!instance) return [];
      const recipe = instanceRecipe(item.recipe, instance);
      return intersects(recipe) ? [{ ...item, instanceId: instance.id, ordinal: index + 2, recipe }] : [];
    }) }))].filter(row => row.items.length > 0);
  });
}
