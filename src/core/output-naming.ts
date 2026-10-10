import type { BatchOptions, MediaAsset } from './types';
export const defaultNamingTemplate = '{name}';
export function validateNamingTemplate(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 160 || /[\\/\x00-\x1f]/.test(value)) throw new Error('Use a filename pattern of 1–160 characters without slashes.');
  if (value.replace(/\{(?:name|index|format|folder|title|artist|album|track)\}/g, '').match(/[{}]/)) throw new Error('Available filename tokens: {name}, {index}, {format}, {folder}, {title}, {artist}, {album}, {track}.');
}
export function filenameStem(value: string) {
  let stem = value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().replace(/^[. ]+|[. ]+$/g, '').slice(0, 180).replace(/[. ]+$/g, '') || 'media';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) stem = `_${stem}`;
  return stem;
}
export function namedConversion(asset: MediaAsset, format: string, template = defaultNamingTemplate, index = 1) {
  validateNamingTemplate(template);
  if (!/^[a-z0-9]+$/i.test(format)) throw new Error('Invalid output extension.');
  const folders = asset.relativePath?.replace(/\\/g, '/').split('/').slice(0, -1) ?? [];
  const values = { name: asset.name.replace(/\.[^.]+$/, ''), index: String(index).padStart(3, '0'), format, folder: folders.at(-1) || 'collection', title: asset.metadata?.title || asset.name.replace(/\.[^.]+$/, ''), artist: asset.metadata?.artist || 'Unknown artist', album: asset.metadata?.album || 'Unknown album', track: asset.metadata?.track?.split('/')[0].padStart(3, '0') || String(index).padStart(3, '0') };
  return `${filenameStem(template.replace(/\{(name|index|format|folder|title|artist|album|track)\}/g, (_, token: keyof typeof values) => values[token]))}.${format}`;
}
export function validateBatchOptions(options: BatchOptions) {
  if (!options || typeof options !== 'object' || Array.isArray(options) || ['conversion', 'keepFolders'].some(key => options[key as keyof BatchOptions] !== undefined && typeof options[key as keyof BatchOptions] !== 'boolean')) throw new Error('Invalid batch options.');
  if (options.namingTemplate !== undefined) validateNamingTemplate(options.namingTemplate);
  if (options.order !== undefined && (!Array.isArray(options.order) || options.order.length > 2000 || new Set(options.order).size !== options.order.length || options.order.some(id => typeof id !== 'string' || !id || id.length > 120))) throw new Error('Invalid conversion sequence.');
}
export const conversionIndex = (options: BatchOptions, id: string) => Math.max(0, options.order?.indexOf(id) ?? 0) + 1;
