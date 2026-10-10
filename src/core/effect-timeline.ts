import { extraInstances, instanceRecipe, primaryPresent } from './effect-instances';
import { clipPositions, clipRecipe } from './clips';
import { availableEffects } from './effect-library';
import type { EditSettings, MediaAsset } from './types';
/** Explicitly added effects remain editable even when their settings are neutral. */
export function clipEffectRows(asset: MediaAsset, edit: EditSettings) {
  const positions = clipPositions(edit).map((position, index) => ({ ...position, index, recipe: clipRecipe(edit, position.clip) }));
  return availableEffects(asset).filter(effect => effect.scope === 'clip').flatMap(effect => {
    const items = positions.filter(({ recipe }) => {
      if (effect.id.includes('Fade')) return recipe.addedEffects?.includes(effect.id) && !recipe[effect.id as 'audioFadeIn'] && !edit[effect.id as 'audioFadeIn'];
      return primaryPresent(recipe, asset, effect.id);
    }).map(item => ({ ...item, instanceId: undefined as string | undefined, ordinal: 1 }));
    const ids = [...new Set(positions.flatMap(({ recipe }) => extraInstances(recipe, effect.id).map(instance => instance.id)))];
    return [{ key: effect.id, effect, items }, ...ids.map((id, index) => ({ key: id, effect, items: positions.flatMap(item => {
      const instance = extraInstances(item.recipe, effect.id).find(instance => instance.id === id);
      return instance ? [{ ...item, instanceId: id, ordinal: index + 2, recipe: instanceRecipe(item.recipe, instance) }] : [];
    }) }))].filter(row => row.items.length > 0);
  });
}
