import { definitionFor, effectiveSpeed } from './effect-instances';
import { availableEffects, effectLibrary } from './effect-library';
import { clipEffectKeys, editClips, type ClipEffects } from './clips';
import { parseEdit } from './project';
import { defaultSettings, type EditSettings, type MediaAsset } from './types';
export interface EffectRecipe { id: string; name: string; settings: ClipEffects; cropBasis?: { width: number; height: number } }
const reference: MediaAsset = { id: '', name: '', kind: 'video', duration: 86400, width: 65536, height: 65536, hasAudio: true, size: 0, previewUrl: '' };
export function parseEffectRecipe(value: unknown): EffectRecipe {
  const recipe = value as EffectRecipe;
  if (!recipe || typeof recipe.id !== 'string' || !recipe.id || recipe.id.length > 120 || typeof recipe.name !== 'string' || !recipe.name.trim() || recipe.name.length > 60 || !recipe.settings || typeof recipe.settings !== 'object' || Array.isArray(recipe.settings) || Object.keys(recipe.settings).some(key => !clipEffectKeys.includes(key as typeof clipEffectKeys[number]))) throw new Error('Invalid effect recipe.');
  const basis = recipe.cropBasis;
  if (basis && ![basis.width, basis.height].every(value => Number.isInteger(value) && value >= 2 && value <= 65536)) throw new Error('Invalid recipe crop dimensions.');
  const parsed = parseEdit({ ...defaultSettings(reference), ...recipe.settings }, { ...reference, width: basis?.width ?? reference.width, height: basis?.height ?? reference.height });
  const settings = Object.fromEntries(Object.keys(recipe.settings).map(key => [key, parsed[key as typeof clipEffectKeys[number]]])) as ClipEffects;
  if (settings.effectInstances) settings.effectInstances = settings.effectInstances.filter(instance => definitionFor(instance.effect).scope === 'clip');
  if (settings.addedEffects) settings.addedEffects = settings.addedEffects.filter(id => effectLibrary.some(effect => effect.id === id && effect.scope === 'clip'));
  return { id: recipe.id, name: recipe.name.trim(), settings, ...(basis ? { cropBasis: { ...basis } } : {}) };
}
export function captureRecipe(edit: EditSettings, asset: MediaAsset, name: string, id: string = crypto.randomUUID()): EffectRecipe {
  return parseEffectRecipe({ id, name, settings: structuredClone(Object.fromEntries(clipEffectKeys.map(key => [key, edit[key]]))), ...(asset.width && asset.height ? { cropBasis: { width: asset.width, height: asset.height } } : {}) });
}
export function recipePatch(recipe: EffectRecipe, asset: MediaAsset, edit: EditSettings): ClipEffects {
  const settings = structuredClone(parseEffectRecipe(recipe).settings);
  if (asset.kind === 'audio') for (const key of ['color', 'geometry', 'crop', 'videoFadeIn', 'videoFadeOut'] as const) delete settings[key];
  else if (settings.crop && recipe.cropBasis && asset.width && asset.height) {
    const c = settings.crop, x = Math.max(0, Math.min(asset.width - 2, Math.round(c.x / recipe.cropBasis.width * asset.width))), y = Math.max(0, Math.min(asset.height - 2, Math.round(c.y / recipe.cropBasis.height * asset.height)));
    settings.crop = { x, y, width: Math.min(asset.width - x, Math.max(2, Math.round(c.width / recipe.cropBasis.width * asset.width))), height: Math.min(asset.height - y, Math.max(2, Math.round(c.height / recipe.cropBasis.height * asset.height))) };
  }
  if (settings.addedEffects) settings.addedEffects = settings.addedEffects.filter(id => availableEffects(asset).some(effect => effect.id === id));
  if (settings.effectInstances) settings.effectInstances = settings.effectInstances.filter(instance => availableEffects(asset).some(effect => effect.id === instance.effect));
  const duration = editClips(edit).reduce((total, clip) => total + (clip.end - clip.start) / effectiveSpeed({ ...edit, ...clip.effects, ...settings }), 0);
  for (const key of ['audioFadeIn', 'audioFadeOut', 'videoFadeIn', 'videoFadeOut'] as const) if (settings[key] !== undefined) settings[key] = Math.min(settings[key]!, duration);
  return settings;
}
export function readRecipes(text: string | null): EffectRecipe[] {
  if (!text || text.length > 2_000_000) return [];
  try { const data = JSON.parse(text); if (data.version !== 1 || !Array.isArray(data.recipes) || data.recipes.length > 20) return []; const recipes = data.recipes.map(parseEffectRecipe); return new Set(recipes.map((recipe: EffectRecipe) => recipe.id)).size === recipes.length ? recipes : []; } catch { return []; }
}
