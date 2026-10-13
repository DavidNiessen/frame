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
    filters.push(
      `format=rgba,split[photo][matte];[matte]drawbox=color=${settings.background}:t=fill:replace=1[background];[background][photo]overlay=format=auto,format=rgb24`,
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
  if (
    edit.format === 'png' ||
    edit.format === 'jpeg' ||
    edit.format === 'bmp' ||
    edit.format === 'tiff'
  )
    args.push('-update', '1');
  args.push(output);
  return args;
}
