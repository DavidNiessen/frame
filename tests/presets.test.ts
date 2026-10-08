import { expect, it } from 'vitest';
import { builtInPresets, compatiblePresets, outputSettings, parseOutputSettings, readPresets } from '../src/core/presets';
import { defaultSettings, type MediaAsset } from '../src/core/types';
const audio: MediaAsset = { id: 'audio', name: 'tone.wav', size: 1, kind: 'audio', duration: 5, hasAudio: true, previewUrl: '' };
it('filters presets by actual source capabilities', () => {
  expect(compatiblePresets(builtInPresets, audio).map(p => p.settings.format)).toEqual(['mp3', 'flac']);
  expect(compatiblePresets(builtInPresets, { ...audio, kind: 'video', hasAudio: false }).map(p => p.settings.format)).toEqual(['mp4', 'mp4', 'mp4', 'gif']);
});
it('ignores source-specific fields in saved output settings', () => {
  const edit = { ...defaultSettings(audio), start: 1, end: 3, volume: 0.5 };
  const output = parseOutputSettings({ ...outputSettings(edit), start: 0, end: 100, volume: 3, crop: { x: -1 } });
  expect({ ...edit, ...output }).toEqual(edit);
  expect(output).not.toHaveProperty('crop'); expect(output).not.toHaveProperty('volume');
});
it('round trips presets and rejects malformed, excessive, or incompatible storage', () => {
  const p = { id: 'user:one', name: 'Delivery', settings: outputSettings(defaultSettings(audio)) };
  const serialize = (presets: unknown[], version = 1) => JSON.stringify({ version, presets });
  expect(readPresets(serialize([p]))).toEqual([p]);
  expect(readPresets('broken')).toEqual([]); expect(readPresets(serialize([p], 2))).toEqual([]);
  expect(readPresets(serialize([p, p]))).toEqual([]); expect(readPresets(serialize(Array(21).fill(p)))).toEqual([]);
  for (const settings of [{ ...p.settings, audioBitrate: 9999 }, { ...p.settings, includeArtwork: 'true' }, { ...p.settings, format: 'exe' }]) expect(readPresets(serialize([{ ...p, settings }]))).toEqual([]);
});
