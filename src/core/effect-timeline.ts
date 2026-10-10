import { clipPositions, clipRecipe } from './clips';
import { availableEffects, effectActive } from './effect-library';
import type { EditSettings, MediaAsset } from './types';
/** Draw only effects that change playback, including inherited shared controls. */
export function clipEffectRows(asset: MediaAsset, edit: EditSettings) {
  const positions = clipPositions(edit).map((position, index) => ({ ...position, index, recipe: clipRecipe(edit, position.clip) }));
  return availableEffects(asset).filter(effect => effect.scope === 'clip' && !effect.id.includes('Fade'))
    .map(effect => ({ effect, items: positions.filter(({ recipe }) => effectActive(effect, recipe, asset)) })).filter(row => row.items.length > 0);
}
