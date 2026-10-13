import { imageResizeGeometry } from './image-resize';
import { namedConversion, filenameStem } from './output-naming';
import { availableFormats } from './formats';
import { outputSettings, type OutputSettings } from './presets';
import { defaultSettings, type EditSettings, type MediaAsset } from './types';

export const canConvert = (asset: MediaAsset, output: OutputSettings) =>
  availableFormats(asset).some((format) => format.id === output.format);

export function conversionSettings(asset: MediaAsset, output: OutputSettings): EditSettings {
  // Conversion always uses the complete source, independently of its editing recipe.
  const settings = { ...defaultSettings(asset), ...outputSettings(output) };
  if (asset.kind === 'image')
    settings.geometry.resize = imageResizeGeometry(
      asset.width ?? 640,
      asset.height ?? 360,
      output.imageResize,
    );
  return settings;
}

export function conversionName(
  asset: MediaAsset,
  format: string,
  keepFolders = false,
  template = '{name}',
  index = 1,
): string {
  const name = namedConversion(asset, format, template, index);
  if (!keepFolders || !asset.relativePath) return name;
  const folders = asset.relativePath.replace(/\\/g, '/').split('/').slice(0, -1);
  if (folders.some((folder) => !folder || folder === '.' || folder === '..'))
    throw new Error('Invalid source folder structure.');
  return [...folders.map(filenameStem), name].join('/');
}
