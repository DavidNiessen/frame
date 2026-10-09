import type { EditSettings } from './types';
export type GifOutput = Pick<EditSettings, 'gifLoop' | 'gifColors' | 'gifDither' | 'gifWidth'>;
export function validateGifOutput(settings: GifOutput) {
  if (!Number.isInteger(settings.gifLoop) || settings.gifLoop < -1 || settings.gifLoop > 100) throw new Error('GIF repeat count must be -1 (once), 0 (forever), or 1–100 extra repeats.');
  if (!Number.isInteger(settings.gifColors) || settings.gifColors < 2 || settings.gifColors > 256) throw new Error('Choose 2–256 GIF palette colors.');
  if (!['sierra2_4a', 'bayer', 'none'].includes(settings.gifDither)) throw new Error('Choose a supported GIF dithering method.');
  if (settings.gifWidth !== null && (!Number.isInteger(settings.gifWidth) || settings.gifWidth < 32 || settings.gifWidth > 4096)) throw new Error('GIF width must be 32–4096 pixels.');
}
export function gifPaletteFilters(edit: GifOutput & Pick<EditSettings, 'fps'>, prefix = 'gif') {
  return [`fps=${edit.fps}`, ...(edit.gifWidth ? [`scale=${edit.gifWidth}:-1:flags=lanczos`] : []), `split[${prefix}a][${prefix}b];[${prefix}a]palettegen=stats_mode=diff:max_colors=${edit.gifColors}[${prefix}p];[${prefix}b][${prefix}p]paletteuse=dither=${edit.gifDither}`];
}
