import { getFormat } from './formats';
import type { EditSettings, MediaAsset } from './types';
import type { RecipeResources } from './resources';
import { videoFilters } from './filters';

import { parseImageOutput } from './image-settings';
export function imageOutputArgs(
  asset: MediaAsset,
  edit: EditSettings,
  input: string,
  output: string,
  resources: RecipeResources,
): string[] {
  const settings = parseImageOutput(edit.imageOutput);
  const format = getFormat(edit.format);
  const filters = videoFilters(asset, edit, resources);
  if (edit.format === 'jpeg' || edit.format === 'bmp') {
    const [red, green, blue] = [1, 3, 5].map((index) =>
      Number.parseInt(settings.background.slice(index, index + 2), 16),
    );
    // Make an opaque matte without altering the foreground's alpha.
    filters.push(
      `format=rgba,split[photo][matte];[matte]lutrgb=r=${red}:g=${green}:b=${blue}:a=255[background];[background][photo]overlay=format=auto,format=rgb24`,
    );
  }
  const args = [
    '-y',
    '-i',
    input,
    '-map',
    '0:V:0',
    '-an',
    '-frames:v',
    '1',
    '-map_metadata',
    edit.keepMetadata ? '0' : '-1',
  ];
  if (filters.length) args.push('-vf', filters.join(','));
  args.push('-c:v', format.videoCodec!, '-threads', '1');
  if (edit.format === 'jpeg')
    args.push('-q:v', String(Math.round(31 - settings.quality * 0.29)), '-pix_fmt', 'yuvj444p');
  if (edit.format === 'webp')
    args.push('-quality', String(settings.quality), '-lossless', settings.lossless ? '1' : '0');
  if (edit.format === 'png') args.push('-pix_fmt', 'rgba');
  if (edit.format !== 'webp') args.push('-f', 'image2pipe');
  args.push(output);
  return args;
}
