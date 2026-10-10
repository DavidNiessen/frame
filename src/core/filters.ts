import { colorFilters } from './color';
import { frameDimensions, geometryFilters } from './geometry';
import { overlayFilters } from './overlays';
import { filterPath, resourcePaths, instancePaths, type RecipeResources } from './resources';
import { outputCues } from './subtitles';
import { cleanupFilters } from './audio-effects';
import { fadeFilters } from './fades';
import { editedDuration } from './timeline';
import { effectiveSpeed, extraInstances, instanceRecipe } from './effect-instances';
import type { EditSettings, MediaAsset } from './types';
export function videoFilters(asset: MediaAsset, edit: EditSettings, resources: RecipeResources = resourcePaths()): string[] {
  const c = edit.crop; const filters = c ? [`crop=${c.width}:${c.height}:${c.x}:${c.y}`] : [];
  filters.push(...geometryFilters(edit), ...colorFilters(edit.color, resources));
  for (const instance of extraInstances(edit)) {
    const recipe = instanceRecipe(edit, instance), paths = instancePaths(resources, instance);
    if (instance.effect === 'crop' && recipe.crop) { const c = recipe.crop; filters.push(`crop=${c.width}:${c.height}:${c.x}:${c.y}`); }
    if (instance.effect === 'transform') filters.push(...geometryFilters(recipe));
    if (instance.effect === 'color') filters.push(...colorFilters(recipe.color, paths));
  }
  const speed = effectiveSpeed(edit);
  if (speed !== 1) filters.push(`setpts=(PTS-STARTPTS)/${speed}`);
  if (edit.subtitles.mode === 'burn' && outputCues(edit).length) filters.push(`subtitles=filename=${filterPath(resources.captions)}:fontsdir=${filterPath(resources.fonts)}`);
  filters.push(...overlayFilters(asset, edit, resources), ...fadeFilters(edit, 'video'));
  for (const instance of extraInstances(edit)) {
    const recipe = instanceRecipe(edit, instance), paths = instancePaths(resources, instance);
    if (instance.effect === 'captions' && recipe.subtitles.mode === 'burn' && outputCues(recipe).length) filters.push(`subtitles=filename=${filterPath(paths.captions)}:fontsdir=${filterPath(paths.fonts)}`);
    if (instance.effect === 'watermark') filters.push(...overlayFilters(asset, { ...recipe, crop: null, geometry: { ...recipe.geometry, rotation: 0, resize: { ...frameDimensions(asset, edit), fit: 'stretch' } } }, paths));
    if (instance.effect.startsWith('videoFade')) filters.push(...fadeFilters({ ...recipe, speed }, 'video').filter(filter => filter.includes(instance.effect.endsWith('In') ? 't=in' : 't=out')));
  }
  return filters;
}
function speedFilters(speed: number, preservePitch: boolean): string[] {
  if (speed === 1) return [];
  if (!preservePitch) return ['aresample=48000', `asetrate=${Math.round(48000 * speed)}`, 'aresample=48000'];
  const filters: string[] = []; let tempo = speed;
  while (tempo < 0.5) { filters.push('atempo=0.5'); tempo *= 2; }
  while (tempo > 2) { filters.push('atempo=2'); tempo /= 2; }
  if (tempo !== 1) filters.push(`atempo=${tempo}`);
  return filters;
}
export function audioFilters(edit: EditSettings, asset?: MediaAsset): string[] {
  const filters = speedFilters(edit.speed, edit.preservePitch);
  for (const instance of extraInstances(edit, 'speed')) filters.push(...speedFilters(instance.settings.speed ?? 1, instance.settings.preservePitch ?? true));
  if (filters.length) filters.push(`apad=whole_dur=${editedDuration(edit)}`);
  filters.push(...cleanupFilters(edit, asset), `volume=${edit.volume}`, ...fadeFilters(edit, 'audio'));
  for (const instance of extraInstances(edit)) {
    const recipe = instanceRecipe(edit, instance);
    if (['noise', 'equalizer', 'normalize'].includes(instance.effect)) {
      const isolated = { ...recipe, reduceNoise: instance.effect === 'noise' && recipe.reduceNoise, normalizeLoudness: instance.effect === 'normalize' && recipe.normalizeLoudness, equalizer: instance.effect === 'equalizer' ? recipe.equalizer : { bass: 0, mid: 0, treble: 0 } };
      filters.push(...cleanupFilters(isolated, asset));
    }
    if (instance.effect === 'volume' && recipe.volume !== 1) filters.push(`volume=${recipe.volume}`);
    if (instance.effect.startsWith('audioFade')) filters.push(...fadeFilters({ ...recipe, speed: effectiveSpeed(edit) }, 'audio').filter(filter => filter.includes(instance.effect.endsWith('In') ? 't=in' : 't=out')));
  }
  return filters;
}
