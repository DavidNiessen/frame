import type { ImageLayerState } from './image-layers';
export const imageBlendModes = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'softlight',
  'hardlight',
  'darken',
  'lighten',
  'difference',
] as const;
export type ImageBlendMode = (typeof imageBlendModes)[number];
export const blendModeNames: Record<ImageBlendMode, string> = {
  normal: 'Normal',
  multiply: 'Multiply',
  screen: 'Screen',
  overlay: 'Overlay',
  softlight: 'Soft light',
  hardlight: 'Hard light',
  darken: 'Darken',
  lighten: 'Lighten',
  difference: 'Difference',
};
export const cssBlendMode = (mode?: ImageBlendMode) =>
  mode === 'softlight' ? 'soft-light' : mode === 'hardlight' ? 'hard-light' : (mode ?? 'normal');
/** Compose full-frame adjustment results; object layers are first drawn on a transparent plane. */
export function compositeImageLayer(
  filters: string[],
  state: ImageLayerState,
  object: boolean,
  prefix: string,
): string[] {
  if (!filters.length) return [];
  const mode = state.blend ?? 'normal',
    opacity = state.opacity ?? 1;
  if (opacity === 0) return [];
  if (mode === 'normal' && opacity === 1) return filters;
  const id = prefix.replace(/[^a-z0-9]/gi, ''),
    f = filters.join(','),
    blend = `blend=all_mode=${mode}:all_opacity=${object ? 1 : opacity}`;
  if (object)
    return [
      `format=rgba,split[bottom${id}][layerinput${id}];[layerinput${id}]lutrgb=r=0:g=0:b=0:a=0,${f},format=rgba,split[top${id}][alpha${id}];[alpha${id}]alphaextract,lut=y='val*${opacity}'[mask${id}];[bottom${id}]split[base${id}][blendbase${id}];[top${id}][blendbase${id}]${blend},format=rgb24[color${id}];[color${id}][mask${id}]alphamerge[over${id}];[base${id}][over${id}]overlay=format=auto`,
    ];
  return [
    `format=rgba,split=3[bottom${id}][layerinput${id}][alpha${id}];[alpha${id}]alphaextract[mask${id}];[layerinput${id}]${f}[top${id}];[top${id}][bottom${id}]${blend},format=rgb24[color${id}];[color${id}][mask${id}]alphamerge`,
  ];
}
