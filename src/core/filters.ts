import { preserveImageAlpha } from './image-alpha';
import { visualFilters } from './visual-filters';
import { defaultOverlays } from './overlays';
import { isVisualEffect } from './visual-settings';
import { timedFilter } from './timed-adjustments';
import { timelineFadeFilter } from './timeline-effects';
import { colorFilters } from './color';
import { frameDimensions, geometryFilters } from './geometry';
import { overlayFilters } from './overlays';
import {
  burnedCues,
  burnedCaptionPath,
  filterPath,
  resourcePaths,
  instancePaths,
  type RecipeResources,
} from './resources';
import { cleanupFilters } from './audio-effects';
import { fadeFilters } from './fades';
import { editedDuration } from './timeline';
import { effectiveSpeed, extraInstances, instanceRecipe } from './effect-instances';
import type { EditSettings, MediaAsset } from './types';
export function videoFilters(
  asset: MediaAsset,
  edit: EditSettings,
  resources: RecipeResources = resourcePaths(),
  timing = edit,
): string[] {
  const speed = effectiveSpeed(edit),
    filters: string[] = [];
  // Establish output time before timed filters without changing visual processing order.
  if (speed !== 1) filters.push(`setpts=(PTS-STARTPTS)/${speed}`);
  const c = edit.crop;
  if (c) filters.push(`crop=${c.width}:${c.height}:${c.x}:${c.y}`);
  filters.push(
    ...geometryFilters(edit),
    ...(asset.kind === 'image'
      ? preserveImageAlpha(visualFilters(edit.visual), 'primary')
      : visualFilters(edit.visual)),
    ...colorFilters(edit.color, resources).map((filter) =>
      timedFilter(filter, timing, edit.effectRanges?.color),
    ),
  );
  for (const instance of extraInstances(edit)) {
    const recipe = instanceRecipe(edit, instance),
      paths = instancePaths(resources, instance);
    if (instance.effect === 'crop' && recipe.crop) {
      const c = recipe.crop;
      filters.push(`crop=${c.width}:${c.height}:${c.x}:${c.y}`);
    }
    if (instance.effect === 'transform') filters.push(...geometryFilters(recipe));
    if (isVisualEffect(instance.effect))
      filters.push(
        ...(asset.kind === 'image'
          ? preserveImageAlpha(visualFilters(recipe.visual), instance.id)
          : visualFilters(recipe.visual).map((filter) =>
              timedFilter(filter, timing, instance.range, instance.timeSpace === 'output'),
            )),
      );
    if (instance.effect === 'color')
      filters.push(
        ...colorFilters(recipe.color, paths).map((filter) =>
          timedFilter(filter, timing, instance.range, instance.timeSpace === 'output'),
        ),
      );
  }
  if (asset.kind !== 'image' && burnedCues(timing).length)
    filters.push(
      `subtitles=filename=${filterPath(burnedCaptionPath(timing, resources))}:fontsdir=${filterPath(resources.fonts)}`,
    );
  if (edit.painting?.image)
    filters.push(
      ...overlayFilters(
        asset,
        {
          ...edit,
          overlays: {
            ...defaultOverlays(),
            image: edit.painting.image,
            imageWidth: 100,
            x: 0,
            y: 0,
          },
        },
        { ...resources, image: `${resources.image}-paint.png` },
        timing,
      ),
    );
  filters.push(...overlayFilters(asset, edit, resources, timing), ...fadeFilters(edit, 'video'));
  for (const instance of extraInstances(edit)) {
    const recipe = instanceRecipe(edit, instance),
      paths = instancePaths(resources, instance);
    if (instance.effect === 'painting' && recipe.painting?.image) {
      const dims = frameDimensions(asset, edit);
      const paint: EditSettings = {
        ...recipe,
        crop: null,
        geometry: {
          ...recipe.geometry,
          rotation: 0,
          flipHorizontal: false,
          flipVertical: false,
          resize: { ...dims, fit: 'stretch' as const },
        },
        overlays: {
          ...defaultOverlays(),
          image: recipe.painting.image,
          imageWidth: 100,
          x: 0,
          y: 0,
        },
      };
      filters.push(
        ...overlayFilters(
          asset,
          paint,
          { ...paths, image: `${paths.image}-paint.png` },
          timing,
        ).map((filter) =>
          instance.range
            ? filter + `:enable='gte(t,${instance.range.start})*lt(t,${instance.range.end})'`
            : filter,
        ),
      );
    }
    if (instance.effect === 'watermark')
      filters.push(
        ...overlayFilters(
          asset,
          {
            ...recipe,
            crop: null,
            geometry: {
              ...recipe.geometry,
              rotation: 0,
              resize: { ...frameDimensions(asset, edit), fit: 'stretch' },
            },
          },
          paths,
          instance.timeSpace === 'output' ? instanceRecipe(timing, instance) : timing,
        ),
      );
    if (instance.effect.startsWith('videoFade'))
      filters.push(
        ...(instance.timeSpace === 'output'
          ? timelineFadeFilter(instance)
          : fadeFilters({ ...recipe, speed }, 'video').filter((filter) =>
              filter.includes(instance.effect.endsWith('In') ? 't=in' : 't=out'),
            )),
      );
  }
  if (asset.kind === 'image' && burnedCues(timing).length)
    filters.push(
      `subtitles=filename=${filterPath(burnedCaptionPath(timing, resources))}:fontsdir=${filterPath(resources.fonts)}`,
    );
  return filters;
}
function speedFilters(speed: number, preservePitch: boolean): string[] {
  if (speed === 1) return [];
  if (!preservePitch)
    return ['aresample=48000', `asetrate=${Math.round(48000 * speed)}`, 'aresample=48000'];
  const filters: string[] = [];
  let tempo = speed;
  while (tempo < 0.5) {
    filters.push('atempo=0.5');
    tempo *= 2;
  }
  while (tempo > 2) {
    filters.push('atempo=2');
    tempo /= 2;
  }
  if (tempo !== 1) filters.push(`atempo=${tempo}`);
  return filters;
}
export function audioFilters(edit: EditSettings, asset?: MediaAsset): string[] {
  const filters = speedFilters(edit.speed, edit.preservePitch);
  for (const instance of extraInstances(edit, 'speed'))
    filters.push(
      ...speedFilters(instance.settings.speed ?? 1, instance.settings.preservePitch ?? true),
    );
  if (filters.length) filters.push(`apad=whole_dur=${editedDuration(edit)}`);
  filters.push(
    ...cleanupFilters(edit, asset),
    timedFilter(
      `volume=${edit.volume}`,
      edit,
      edit.volume === 1 ? undefined : edit.effectRanges?.volume,
    ),
    ...fadeFilters(edit, 'audio'),
  );
  for (const instance of extraInstances(edit)) {
    const recipe = instanceRecipe(edit, instance);
    if (['noise', 'equalizer', 'normalize'].includes(instance.effect)) {
      const isolated = {
        ...recipe,
        reduceNoise: instance.effect === 'noise' && recipe.reduceNoise,
        normalizeLoudness: instance.effect === 'normalize' && recipe.normalizeLoudness,
        equalizer:
          instance.effect === 'equalizer' ? recipe.equalizer : { bass: 0, mid: 0, treble: 0 },
      };
      filters.push(...cleanupFilters(isolated, asset, instance.timeSpace === 'output'));
    }
    if (instance.effect === 'volume' && recipe.volume !== 1)
      filters.push(
        timedFilter(
          `volume=${recipe.volume}`,
          edit,
          instance.range,
          instance.timeSpace === 'output',
        ),
      );
    if (instance.effect.startsWith('audioFade'))
      filters.push(
        ...(instance.timeSpace === 'output'
          ? timelineFadeFilter(instance)
          : fadeFilters({ ...recipe, speed: effectiveSpeed(edit) }, 'audio').filter((filter) =>
              filter.includes(instance.effect.endsWith('In') ? 't=in' : 't=out'),
            )),
      );
  }
  return filters;
}
