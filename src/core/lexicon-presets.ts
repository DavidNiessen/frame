import { getFormat } from './formats';
import { builtInPresets, outputSettings, type ExportPreset, type OutputSettings } from './presets';
import { defaultSettings, type MediaAsset } from './types';
import type { LexiconPresetChoice } from './lexicon';

const sample: MediaAsset = {
  id: '',
  name: '',
  size: 0,
  duration: 1,
  kind: 'audio',
  hasAudio: true,
  previewUrl: '',
};
const preset = (id: string, name: string, patch: Partial<OutputSettings>): ExportPreset => ({
  id,
  name,
  settings: outputSettings({ ...defaultSettings(sample), ...patch }),
});
const isAudio = (preset: ExportPreset) => getFormat(preset.settings.format).kind === 'audio';

/** Audio presets for DJ libraries, offered before Frame's own audio presets. */
export const lexiconBuiltInPresets: ExportPreset[] = [
  preset('lexicon:mp3-320', 'DJ MP3 • 320 kbps', { format: 'mp3', audioBitrate: 320 }),
  preset('lexicon:aac-256', 'DJ AAC • 256 kbps', { format: 'm4a', audioBitrate: 256 }),
  preset('lexicon:wav-16', 'CDJ WAV • 16-bit 44.1 kHz', {
    format: 'wav',
    wavDepth: 16,
    audioSampleRate: 44100,
  }),
  preset('lexicon:wav-24', 'Studio WAV • 24-bit', { format: 'wav', wavDepth: 24 }),
  ...builtInPresets.filter(isAudio),
];

/** Presets Lexicon can choose from: the built-in ones and the user's saved audio presets. */
export function lexiconPresets(user: ExportPreset[]): ExportPreset[] {
  return [...lexiconBuiltInPresets, ...user.filter(isAudio)];
}

export function presetChoices(presets: ExportPreset[]): LexiconPresetChoice[] {
  return presets.map(({ id, name, settings }) => ({ id, name, format: settings.format }));
}
