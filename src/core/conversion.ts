import { availableFormats } from './formats';
import { outputName } from './export-plan';
import { outputSettings, type OutputSettings } from './presets';
import { defaultSettings, type EditSettings, type MediaAsset } from './types';

export const canConvert = (asset: MediaAsset, output: OutputSettings) => availableFormats(asset).some(format => format.id === output.format);

export function conversionSettings(asset: MediaAsset, output: OutputSettings): EditSettings {
  // Conversion always uses the complete source, independently of its editing recipe.
  return { ...defaultSettings(asset), ...outputSettings(output) };
}

export function conversionName(asset: MediaAsset, format: string, keepFolders = false): string {
  const name = outputName(asset.name, format).replace(/-edited(?=\.[^.]+$)/, '');
  if (!keepFolders || !asset.relativePath) return name;
  const folders = asset.relativePath.replace(/\\/g, '/').split('/').slice(0, -1);
  if (folders.some(folder => !folder || folder === '.' || folder === '..')) throw new Error('Invalid source folder structure.');
  return [...folders.map(folder => folder.replace(/[<>:"|?*\x00-\x1f]/g, '_')), name].join('/');
}
