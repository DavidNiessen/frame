import { defaultSettings, type EditSettings, type MediaAsset } from './types';
export type EffectId = 'mix' | 'volume' | 'speed' | 'audioFadeIn' | 'audioFadeOut' | 'videoFadeIn' | 'videoFadeOut' | 'normalize' | 'noise' | 'equalizer' | 'color' | 'transform' | 'captions' | 'watermark' | 'silence';
export interface EffectDefinition { id: EffectId; name: string; description: string; group: 'Audio' | 'Video' | 'Timing'; scope: 'clip' | 'source'; keys: (keyof EditSettings)[] }
export const effectLibrary: EffectDefinition[] = [
  { id: 'mix', name: 'Music & voiceover', description: 'Layer music and narration over the edit', group: 'Audio', scope: 'source', keys: ['audioLayers'] },
  { id: 'volume', name: 'Volume', description: 'Mute, balance or boost a clip', group: 'Audio', scope: 'clip', keys: ['volume'] },
  { id: 'speed', name: 'Speed', description: 'Slow down or speed up', group: 'Timing', scope: 'clip', keys: ['speed', 'preservePitch'] },
  { id: 'audioFadeIn', name: 'Audio fade in', description: 'Ease into the sound', group: 'Audio', scope: 'clip', keys: ['audioFadeIn'] },
  { id: 'audioFadeOut', name: 'Audio fade out', description: 'Ease out of the sound', group: 'Audio', scope: 'clip', keys: ['audioFadeOut'] },
  { id: 'normalize', name: 'Normalize loudness', description: 'A consistent listening level', group: 'Audio', scope: 'clip', keys: ['normalizeLoudness', 'targetLufs'] },
  { id: 'noise', name: 'Noise reduction', description: 'Reduce steady hiss and room noise', group: 'Audio', scope: 'clip', keys: ['reduceNoise', 'noiseStrength', 'noiseFloor'] },
  { id: 'equalizer', name: 'Equalizer', description: 'Shape bass, mids and treble', group: 'Audio', scope: 'clip', keys: ['equalizer'] },
  { id: 'videoFadeIn', name: 'Video fade in', description: 'Reveal the picture from black', group: 'Video', scope: 'clip', keys: ['videoFadeIn'] },
  { id: 'videoFadeOut', name: 'Video fade out', description: 'Fade the picture to black', group: 'Video', scope: 'clip', keys: ['videoFadeOut'] },
  { id: 'color', name: 'Color & LUTs', description: 'Adjust the look and import a LUT', group: 'Video', scope: 'clip', keys: ['color'] },
  { id: 'transform', name: 'Rotate, flip & resize', description: 'Reframe your picture', group: 'Video', scope: 'clip', keys: ['geometry'] },
  { id: 'captions', name: 'Captions', description: 'Import or write timed captions', group: 'Video', scope: 'source', keys: ['subtitles'] },
  { id: 'watermark', name: 'Watermark', description: 'Place text or artwork', group: 'Video', scope: 'source', keys: ['overlays'] },
  { id: 'silence', name: 'Remove silence', description: 'Find quiet gaps in the source', group: 'Audio', scope: 'source', keys: [] },
];
export function availableEffects(asset: MediaAsset) { return effectLibrary.filter(effect => effect.group !== 'Video' || asset.kind === 'video').filter(effect => effect.group !== 'Audio' || asset.hasAudio || effect.id === 'mix'); }
export function effectActive(effect: EffectDefinition, edit: EditSettings, asset: MediaAsset) {
  const defaults = defaultSettings(asset);
  return effect.keys.some(key => JSON.stringify(edit[key]) !== JSON.stringify(defaults[key]));
}
export function resetEffect(effect: EffectDefinition, asset: MediaAsset): Partial<EditSettings> {
  const defaults = defaultSettings(asset);
  return Object.fromEntries(effect.keys.map(key => [key, defaults[key]]));
}
export function enableEffect(effect: EffectDefinition, edit: EditSettings): Partial<EditSettings> {
  if (effect.id === 'normalize') return { normalizeLoudness: true };
  if (effect.id === 'noise') return { reduceNoise: true };
  if (effect.id.endsWith('FadeIn') || effect.id.endsWith('FadeOut')) return { [effect.id]: Math.min(.5, (edit.end - edit.start) / edit.speed / 4) };
  return {};
}
