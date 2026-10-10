import { extraInstances } from './effect-instances';
import { defaultSettings, type EditSettings, type MediaAsset } from './types';
import { clipRecipe, editClips } from './clips';
import type { EffectId } from './effect-ids';
export type { EffectId } from './effect-ids';
export interface EffectDefinition { id: EffectId; name: string; description: string; group: 'Audio' | 'Video' | 'Timing'; scope: 'clip' | 'source'; repeatable?: boolean; keys: (keyof EditSettings)[] }
/** Read older projects without exposing audio insertion as an effect. */
export const legacyMixEffect: EffectDefinition = { id: 'mix', name: 'Audio layers', description: 'Imported audio layers', group: 'Audio', scope: 'source', keys: ['audioLayers'] };
export const effectLibrary: EffectDefinition[] = [
  { id: 'volume', repeatable: true, name: 'Volume', description: 'Mute, balance or boost the sound', group: 'Audio', scope: 'clip', keys: ['volume'] },
  { id: 'speed', name: 'Speed', description: 'Slow down or speed up', group: 'Timing', scope: 'clip', keys: ['speed', 'preservePitch'] },
  { id: 'audioFadeIn', repeatable: true, name: 'Audio fade in', description: 'Ease into the sound', group: 'Audio', scope: 'clip', keys: ['audioFadeIn'] },
  { id: 'audioFadeOut', repeatable: true, name: 'Audio fade out', description: 'Ease out of the sound', group: 'Audio', scope: 'clip', keys: ['audioFadeOut'] },
  { id: 'normalize', name: 'Normalize loudness', description: 'A consistent listening level', group: 'Audio', scope: 'clip', keys: ['normalizeLoudness', 'targetLufs'] },
  { id: 'noise', repeatable: true, name: 'Noise reduction', description: 'Reduce steady hiss and room noise', group: 'Audio', scope: 'clip', keys: ['reduceNoise', 'noiseStrength', 'noiseFloor'] },
  { id: 'equalizer', repeatable: true, name: 'Equalizer', description: 'Shape bass, mids and treble', group: 'Audio', scope: 'clip', keys: ['equalizer'] },
  { id: 'videoFadeIn', repeatable: true, name: 'Video fade in', description: 'Reveal the picture from black', group: 'Video', scope: 'clip', keys: ['videoFadeIn'] },
  { id: 'videoFadeOut', repeatable: true, name: 'Video fade out', description: 'Fade the picture to black', group: 'Video', scope: 'clip', keys: ['videoFadeOut'] },
  { id: 'color', repeatable: true, name: 'Color & LUTs', description: 'Adjust the look and import a LUT', group: 'Video', scope: 'clip', keys: ['color'] },
  { id: 'crop', name: 'Crop', description: 'Trim the edges of the picture', group: 'Video', scope: 'clip', keys: ['crop'] },
  { id: 'transform', name: 'Rotate, flip & resize', description: 'Reframe your picture', group: 'Video', scope: 'clip', keys: ['geometry'] },
  { id: 'captions', repeatable: true, name: 'Captions', description: 'Import or write timed captions', group: 'Video', scope: 'source', keys: ['subtitles'] },
  { id: 'watermark', repeatable: true, name: 'Watermark', description: 'Place text or artwork', group: 'Video', scope: 'source', keys: ['overlays'] },
  { id: 'silence', name: 'Remove silence', description: 'Find quiet gaps in the source', group: 'Audio', scope: 'source', keys: ['silenceOptions'] },
];
/** Public placement reflects new timeline effects; scope retains legacy project targeting. */
export function effectPlacement(effect: EffectDefinition): 'source' | 'layer' | 'timed' | 'track' {
  if (effect.id === 'silence') return 'source';
  if (effect.id === 'mix') return 'layer';
  return effect.repeatable ? 'timed' : 'track';
}
export function availableEffects(asset: MediaAsset) { return effectLibrary.filter(effect => effect.group !== 'Video' || asset.kind === 'video').filter(effect => effect.group !== 'Audio' || asset.hasAudio || effect.id === 'mix'); }
export function effectActive(effect: EffectDefinition, edit: EditSettings, asset: MediaAsset) {
  if (effect.id === 'volume') return edit.volume !== 1;
  if (effect.id === 'normalize') return edit.normalizeLoudness;
  if (effect.id === 'noise') return edit.reduceNoise;
  if (effect.id === 'speed') return edit.speed !== 1;
  if (effect.id === 'watermark') return !!(edit.overlays.text || edit.overlays.image);
  if (effect.id === 'captions') return edit.subtitles.cues.length > 0;
  if (effect.id === 'mix') return (edit.audioLayers?.length ?? 0) > 0;
  if (effect.id === 'crop') return !!edit.crop;
  if (effect.id.includes('Fade')) return Number(edit[effect.id as 'audioFadeIn']) > 0;
  if (effect.id === 'equalizer') return Object.values(edit.equalizer).some(value => value !== 0);
  if (effect.id === 'color') return !!(edit.color.brightness || edit.color.contrast !== 1 || edit.color.saturation !== 1 || edit.color.temperature || edit.color.lut);
  if (effect.id === 'transform') return !!(edit.geometry.rotation || edit.geometry.flipHorizontal || edit.geometry.flipVertical || edit.geometry.resize);
  const defaults = defaultSettings(asset);
  return effect.id !== 'silence' && effect.keys.some(key => JSON.stringify(edit[key]) !== JSON.stringify(defaults[key]));
}
function equalSetting(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => Object.hasOwn(b, key) && equalSetting(a[key], b[key]));
}
export function sameEffectSettings(effect: EffectDefinition, left: EditSettings, right: EditSettings) {
  return effect.keys.every(key => equalSetting(left[key], right[key]));
}
export function appliedEffects(asset: MediaAsset, edit: EditSettings, selectedClip: string | null) {
  const clips = editClips(edit), clip = clips.find(item => item.id === selectedClip);
  const present = (effect: EffectDefinition, recipe: EditSettings) => recipe.addedEffects?.includes(effect.id) || extraInstances(recipe, effect.id).length > 0 || effectActive(effect, recipe, asset);
  return availableEffects(asset).filter(effect => effect.scope === 'source' ? present(effect, edit)
    : clip ? present(effect, clipRecipe(edit, clip))
    : present(effect, edit) || clips.some(item => present(effect, clipRecipe(edit, item))));
}
export function effectSummary(effect: EffectDefinition, edit: EditSettings): string {
  if (effect.id === 'volume') return `${Math.round(edit.volume * 100)}%`;
  if (effect.id === 'speed') return `${edit.speed}×`;
  if (effect.id.includes('Fade')) return `${Number(edit[effect.id as 'audioFadeIn']).toFixed(2)}s`;
  if (effect.id === 'normalize') return `${edit.targetLufs} LUFS`;
  if (effect.id === 'crop') return edit.crop ? `${edit.crop.width} × ${edit.crop.height}` : 'Original frame';
  if (effect.id === 'captions') return `${edit.subtitles.cues.length} captions${edit.subtitles.mode === 'none' ? ' · off' : ''}`;
  if (effect.id === 'mix') return `${edit.audioLayers?.length ?? 0} tracks`;
  if (effect.id === 'color' && edit.color.lutName) return edit.color.lutName;
  return effect.description;
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
