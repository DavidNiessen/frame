import type { EffectId } from './effect-ids';
export const imageEffectCategories = ['Adjust', 'Style', 'Frame', 'Layers'] as const;
export function imageEffectCategory(id: EffectId): (typeof imageEffectCategories)[number] {
  if (['crop', 'transform'].includes(id)) return 'Frame';
  if (['painting', 'captions', 'watermark'].includes(id)) return 'Layers';
  if (
    [
      'vignette',
      'blur',
      'grayscale',
      'sepia',
      'invert',
      'pixelate',
      'posterize',
      'grain',
      'sketch',
      'emboss',
    ].includes(id)
  )
    return 'Style';
  return 'Adjust';
}
