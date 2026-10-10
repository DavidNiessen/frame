import { clipPositions, clipRecipe } from './clips';
import { availableEffects, effectActive } from './effect-library';
import type { EditSettings, MediaAsset } from './types';
/** Explicitly added effects remain editable even when their settings are neutral. */
export function clipEffectRows(asset: MediaAsset, edit: EditSettings) {
  const positions = clipPositions(edit).map((position, index) => ({ ...position, index, recipe: clipRecipe(edit, position.clip) }));
  return availableEffects(asset).filter(effect => effect.scope === 'clip')
    .map(effect => ({ effect, items: positions.filter(({ recipe }) => {
      // Active fades have duration handles in their own lanes; neutral ones still need a settings bar.
      if (effect.id.includes('Fade')) return recipe.addedEffects?.includes(effect.id) && !recipe[effect.id as 'audioFadeIn'] && !edit[effect.id as 'audioFadeIn'];
      return recipe.addedEffects?.includes(effect.id) || effectActive(effect, recipe, asset);
    }) })).filter(row => row.items.length > 0);
}
