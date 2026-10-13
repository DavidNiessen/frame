import { isTimedAdjustment, parseEffectRange } from './timed-adjustments';
import { hasTimelineRange } from './timeline-effects';
import {
  captionLimit,
  definitionFor,
  instanceLimit,
  instanceRecipe,
  type EffectInstance,
} from './effect-instances';
import { defaultSettings, type MediaAsset } from './types';
import { effectIds } from './effect-ids';
import { parseSubtitles } from './subtitles';

/** Parameter validation is supplied by the recipe parser; nested stacks are never accepted. */
export function parseEffectInstances(
  value: unknown,
  asset: MediaAsset,
  validate: (recipe: ReturnType<typeof defaultSettings>) => void,
  clipOnly = false,
): EffectInstance[] | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length > instanceLimit + captionLimit ||
    value.filter((item) => item?.effect !== 'captions').length > instanceLimit ||
    value.filter((item) => item?.effect === 'captions').length > captionLimit
  )
    throw new Error('Invalid effect instances.');
  const ids = new Set<string>();
  return value.map((instance: EffectInstance) => {
    if (
      !instance ||
      typeof instance.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,120}$/.test(instance.id) ||
      ids.has(instance.id) ||
      !effectIds.includes(instance.effect)
    )
      throw new Error('Invalid effect instance identifier.');
    ids.add(instance.id);
    const effect = definitionFor(instance.effect);
    if (effect.mediaKinds && !effect.mediaKinds.includes(asset.kind))
      throw new Error('This effect is not supported for this media type.');
    if (
      (clipOnly && effect.scope !== 'clip') ||
      !instance.settings ||
      typeof instance.settings !== 'object' ||
      Array.isArray(instance.settings) ||
      Object.keys(instance.settings).some(
        (key) => !effect.keys.includes(key as keyof typeof instance.settings),
      )
    )
      throw new Error('Invalid effect instance parameters.');
    if (
      (instance.timeSpace !== undefined && instance.timeSpace !== 'output') ||
      (clipOnly && instance.timeSpace)
    )
      throw new Error('Invalid effect time space.');
    if (
      instance.range !== undefined &&
      !(instance.timeSpace === 'output'
        ? hasTimelineRange(instance.effect)
        : isTimedAdjustment(instance.effect))
    )
      throw new Error('This effect cannot have an independent time range.');
    if (instance.timeSpace === 'output' && hasTimelineRange(instance.effect) && !instance.range)
      throw new Error('A timed timeline effect needs a range.');
    const range = parseEffectRange(instance.range);
    const recipe = instanceRecipe(defaultSettings(asset), instance);
    if (instance.timeSpace === 'output' && instance.effect.includes('Fade')) {
      const value = Number(instance.settings[instance.effect as 'audioFadeOut']);
      if (!Number.isFinite(value) || value < 0 || value > 86400)
        throw new Error('Invalid timeline fade duration.');
      validate({ ...recipe, [instance.effect]: 0 });
    } else if (instance.effect === 'crop' && recipe.crop) {
      const crop = recipe.crop;
      if (
        ![crop.x, crop.y, crop.width, crop.height].every(Number.isInteger) ||
        crop.x < 0 ||
        crop.y < 0 ||
        crop.width < 2 ||
        crop.height < 2
      )
        throw new Error('Invalid crop instance.');
      validate({ ...recipe, crop: null });
    } else validate(recipe);
    return {
      id: instance.id,
      effect: instance.effect,
      ...(instance.timeSpace ? { timeSpace: instance.timeSpace } : {}),
      ...(range ? { range } : {}),
      settings:
        instance.effect === 'captions'
          ? { subtitles: parseSubtitles(recipe.subtitles) }
          : structuredClone(instance.settings),
    };
  });
}
