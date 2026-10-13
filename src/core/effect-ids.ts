import { visualIds } from './visual-settings';
export const effectIds = [
  ...visualIds,
  'painting',
  'retouch',
  'cutout',
  'curves',
  'shape',
  'mix',
  'media',
  'volume',
  'speed',
  'audioFadeIn',
  'audioFadeOut',
  'videoFadeIn',
  'videoFadeOut',
  'normalize',
  'noise',
  'equalizer',
  'color',
  'crop',
  'transform',
  'captions',
  'watermark',
  'silence',
] as const;
export type EffectId = (typeof effectIds)[number];
/** Optional UI membership keeps a deliberately added neutral effect in its clip's controls. */
export function parseAddedEffects(value: unknown): EffectId[] | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length > effectIds.length ||
    new Set(value).size !== value.length ||
    value.some((id) => !effectIds.includes(id))
  )
    throw new Error('Invalid added effects.');
  return [...value];
}
