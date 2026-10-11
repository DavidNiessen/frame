import type { EditSettings } from './types';
export type GifPass = { kind: 'palette' } | { kind: 'encode'; path: string };
export type GifOutput = Pick<EditSettings, 'gifLoop' | 'gifColors' | 'gifDither' | 'gifWidth'>;
export function validateGifOutput(settings: GifOutput) {
  if (!Number.isInteger(settings.gifLoop) || settings.gifLoop < -1 || settings.gifLoop > 100)
    throw new Error('GIF repeat count must be -1 (once), 0 (forever), or 1–100 extra repeats.');
  if (!Number.isInteger(settings.gifColors) || settings.gifColors < 2 || settings.gifColors > 256)
    throw new Error('Choose 2–256 GIF palette colors.');
  if (!['sierra2_4a', 'bayer', 'none'].includes(settings.gifDither))
    throw new Error('Choose a supported GIF dithering method.');
  if (
    settings.gifWidth !== null &&
    (!Number.isInteger(settings.gifWidth) || settings.gifWidth < 32 || settings.gifWidth > 4096)
  )
    throw new Error('GIF width must be 32–4096 pixels.');
}
export function gifPaletteFilters(
  edit: GifOutput & Pick<EditSettings, 'fps'>,
  prefix = 'gif',
  pass?: 'palette' | number,
) {
  return [
    `fps=${edit.fps}`,
    ...(edit.gifWidth ? [`scale=${edit.gifWidth}:-1:flags=lanczos`] : []),
    pass === 'palette'
      ? `palettegen=stats_mode=diff:max_colors=${edit.gifColors}`
      : typeof pass === 'number'
        ? `format=rgb24[${prefix}b];[${prefix}b][${pass}:v:0]paletteuse=dither=${edit.gifDither}`
        : `split[${prefix}a][${prefix}b];[${prefix}a]palettegen=stats_mode=diff:max_colors=${edit.gifColors}[${prefix}p];[${prefix}b][${prefix}p]paletteuse=dither=${edit.gifDither}`,
  ];
}

export function gifMappingArgs(edit: GifOutput, pass?: GifPass) {
  return [
    '-map',
    '[gif]',
    '-an',
    ...(pass?.kind === 'palette'
      ? ['-frames:v', '1', '-update', '1']
      : ['-loop', String(edit.gifLoop)]),
  ];
}
