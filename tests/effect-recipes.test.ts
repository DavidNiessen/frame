import { expect, it } from 'vitest';
import { captureRecipe, parseEffectRecipe, readRecipes, recipePatch } from '../src/core/effect-recipes';
import { defaultSettings, type MediaAsset } from '../src/core/types';
import { validateEdit } from '../src/core/export-plan';
const asset: MediaAsset = { id: 'a', name: 'a.mp4', kind: 'video', duration: 10, width: 1920, height: 1080, hasAudio: true, size: 1, previewUrl: '' };
it('adapts crop coordinates and fade durations across recipients without copying timeline or output settings', () => {
  const recipe = captureRecipe({ ...defaultSettings(asset), volume: .4, speed: 2, audioFadeIn: 4, crop: { x: 960, y: 0, width: 960, height: 1080 }, format: 'gif', markers: [{ id: 'm', name: 'Mark', time: 1, color: 'blue' }] }, asset, 'Look');
  expect(recipe.settings).not.toHaveProperty('format'); expect(recipe.settings).not.toHaveProperty('markers');
  const receiver = { ...asset, width: 640, height: 360, duration: 2 }, edit = defaultSettings(receiver);
  const patch = recipePatch(recipe, receiver, edit);
  expect(patch).toMatchObject({ crop: { x: 320, y: 0, width: 320, height: 360 }, volume: .4, speed: 2, audioFadeIn: 1 });
  expect(() => validateEdit(receiver, { ...edit, ...patch })).not.toThrow();
  const audio = { ...receiver, kind: 'audio' as const }, audioPatch = recipePatch(recipe, audio, defaultSettings(audio));
  expect(audioPatch).not.toHaveProperty('crop'); expect(audioPatch).not.toHaveProperty('color'); expect(audioPatch.volume).toBe(.4);
});
it('validates persisted recipes and returns independent copies', () => {
  const recipe = captureRecipe(defaultSettings(asset), asset, 'Clean');
  const read = readRecipes(JSON.stringify({ version: 1, recipes: [recipe] })); expect(read).toEqual([recipe]);
  const patch = recipePatch(recipe, asset, defaultSettings(asset)); patch.equalizer!.bass = 10; expect(recipe.settings.equalizer!.bass).toBe(0);
  for (const settings of [{ volume: 10 }, { speed: NaN }, { crop: { x: -1, y: 0, width: 10, height: 10 } }, { format: 'wav' }]) expect(() => parseEffectRecipe({ ...recipe, settings })).toThrow();
  expect(readRecipes(JSON.stringify({ version: 1, recipes: [recipe, recipe] }))).toEqual([]);
});
