import { isTimedAdjustment, parseEffectRange } from './timed-adjustments';
import { captionLimit, definitionFor, instanceLimit, instanceRecipe, type EffectInstance } from './effect-instances';
import { defaultSettings, type MediaAsset } from './types';
import { effectIds } from './effect-ids';
import { parseSubtitles } from './subtitles';

/** Parameter validation is supplied by the recipe parser; nested stacks are never accepted. */
export function parseEffectInstances(value: unknown, asset: MediaAsset, validate: (recipe: ReturnType<typeof defaultSettings>) => void, clipOnly = false): EffectInstance[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > instanceLimit + captionLimit || value.filter(item => item?.effect !== 'captions').length > instanceLimit || value.filter(item => item?.effect === 'captions').length > captionLimit) throw new Error('Invalid effect instances.');
  const ids = new Set<string>();
  return value.map((instance: EffectInstance) => {
    if (!instance || typeof instance.id !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(instance.id) || ids.has(instance.id) || !effectIds.includes(instance.effect)) throw new Error('Invalid effect instance identifier.');
    ids.add(instance.id); const effect = definitionFor(instance.effect);
    if (clipOnly && effect.scope !== 'clip' || !instance.settings || typeof instance.settings !== 'object' || Array.isArray(instance.settings) || Object.keys(instance.settings).some(key => !effect.keys.includes(key as keyof typeof instance.settings))) throw new Error('Invalid effect instance parameters.');
    if (instance.range !== undefined && !isTimedAdjustment(instance.effect)) throw new Error('This effect cannot have an independent time range.');
    const range = parseEffectRange(instance.range);
    const recipe = instanceRecipe(defaultSettings(asset), instance);
    if (instance.effect === 'crop' && recipe.crop) {
      const crop = recipe.crop;
      if (![crop.x, crop.y, crop.width, crop.height].every(Number.isInteger) || crop.x < 0 || crop.y < 0 || crop.width < 2 || crop.height < 2) throw new Error('Invalid crop instance.');
      validate({ ...recipe, crop: null });
    } else validate(recipe);
    return { id: instance.id, effect: instance.effect, ...(range ? { range } : {}), settings: instance.effect === 'captions' ? { subtitles: parseSubtitles(recipe.subtitles) } : structuredClone(instance.settings) };
  });
}
