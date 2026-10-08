import { availableFormats } from './formats';
import { parseEdit } from './project';
import { defaultSettings, type EditSettings, type MediaAsset } from './types';
export type OutputSettings = Pick<EditSettings, 'targetSizeMb' | 'format' | 'quality' | 'videoBitrate' | 'audioBitrate' | 'fps' | 'includeArtwork' | 'keepMetadata'>;
export interface ExportPreset { id: string; name: string; settings: OutputSettings }
const sample: MediaAsset = { id: '', name: '', size: 0, duration: 1, kind: 'video', width: 640, height: 360, hasAudio: true, previewUrl: '' };
export function outputSettings(edit: OutputSettings): OutputSettings {
  const { targetSizeMb, format, quality, videoBitrate, audioBitrate, fps, includeArtwork, keepMetadata } = edit;
  return { targetSizeMb: targetSizeMb ?? null, format, quality, videoBitrate, audioBitrate, fps, includeArtwork, keepMetadata };
}
export function parseOutputSettings(value: unknown): OutputSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid export preset.');
  const s = value as Record<string, unknown>;
  // Read output fields explicitly: saved presets cannot replace source-specific editing data.
  return outputSettings(parseEdit({ ...defaultSettings(sample), format: s.format, quality: s.quality,
    targetSizeMb: s.targetSizeMb, videoBitrate: s.videoBitrate, audioBitrate: s.audioBitrate, fps: s.fps,
    includeArtwork: s.includeArtwork, keepMetadata: s.keepMetadata }, sample));
}
const preset = (id: string, name: string, patch: Partial<OutputSettings>): ExportPreset => ({ id, name, settings: outputSettings({ ...defaultSettings(sample), ...patch }) });
export const builtInPresets: ExportPreset[] = [
  preset('builtin:balanced', 'Balanced video • MP4', {}),
  preset('builtin:small', 'Smaller video • MP4', { quality: 'small', audioBitrate: 128 }),
  preset('builtin:high', 'High quality video • MP4', { quality: 'high', audioBitrate: 256 }),
  preset('builtin:gif', 'Shareable animation • GIF', { format: 'gif', fps: 12 }),
  preset('builtin:audio', 'Balanced audio • MP3', { format: 'mp3' }),
  preset('builtin:lossless', 'Lossless audio • FLAC', { format: 'flac' }),
];
export function compatiblePresets(presets: ExportPreset[], asset: MediaAsset): ExportPreset[] {
  const allowed = availableFormats(asset).map(format => format.id);
  return presets.filter(p => allowed.includes(p.settings.format));
}
export function readPresets(serialized: string | null): ExportPreset[] {
  if (!serialized || serialized.length > 100000) return [];
  try {
    const doc = JSON.parse(serialized);
    if (doc.version !== 1 || !Array.isArray(doc.presets) || doc.presets.length > 20) return [];
    const ids = new Set<string>();
    return doc.presets.map((p: unknown) => {
      if (!p || typeof p !== 'object') throw new Error('Invalid preset.');
      const item = p as Record<string, unknown>;
      if (typeof item.id !== 'string' || !item.id.startsWith('user:') || item.id.length > 100 || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 60) throw new Error('Invalid preset.');
      ids.add(item.id);
      return { id: item.id, name: item.name, settings: parseOutputSettings(item.settings) };
    });
  } catch { return []; }
}
export const sameOutput = (a: OutputSettings, b: OutputSettings) => JSON.stringify(outputSettings(a)) === JSON.stringify(outputSettings(b));
