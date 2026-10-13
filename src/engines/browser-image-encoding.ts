import { videoFilters } from '../core/filters';
import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { buildExportArgs } from '../core/export-plan';
import { frameDimensions } from '../core/geometry';
import {
  defaultSettings,
  type EditSettings,
  type MediaAsset,
  type ExportProgress,
} from '../core/types';
import type { RecipeResources } from '../core/resources';
import { encodeBrowserOutput } from './browser-encoding';
export const renderedImagePath = 'edited-image.png';
/** Separate compositing from encoding: WASM's JPEG encoder crashes with subtitle/image filters. */
export async function browserImageEncoding(
  ff: FFmpeg,
  asset: MediaAsset,
  settings: EditSettings,
  input: string,
  resources: RecipeResources,
  progress: (p: ExportProgress) => void,
) {
  if (
    asset.kind !== 'image' ||
    settings.format === 'png' ||
    !videoFilters(asset, settings, resources).length
  )
    return { asset, settings, input };
  await encodeBrowserOutput(
    ff,
    'png',
    (_pass, destination) =>
      buildExportArgs(asset, { ...settings, format: 'png' }, input, destination, resources),
    renderedImagePath,
    1,
    progress,
  );
  const rendered = { ...asset, ...frameDimensions(asset, settings) };
  return {
    asset: rendered,
    input: renderedImagePath,
    settings: {
      ...defaultSettings(rendered),
      format: settings.format,
      imageOutput: settings.imageOutput,
      keepMetadata: settings.keepMetadata,
    },
  };
}
