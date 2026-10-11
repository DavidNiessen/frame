import { definitionFor, effectiveSpeed, extraInstances } from './effect-instances';
import { clipStageEffect } from './timeline-effects';
import { clipRecipe } from './clips';
import { defaultColor } from './color';
import { defaultGeometry, frameDimensions } from './geometry';
import { defaultOverlays } from './overlays';
import { audioFilters, videoFilters } from './filters';
import type { RecipeResources } from './resources';
import type { EditSettings, MediaAsset } from './types';

/** Clip geometry/speed and legacy controls run before joining; track effects run once afterward. */
export function clipFilterGraph(
  asset: MediaAsset,
  edit: EditSettings,
  input: string,
  prefix: string,
  paths: RecipeResources,
  video: boolean,
  audio: boolean,
) {
  const graph: string[] = [],
    clips = edit.clips!;
  const dimensions = frameDimensions(asset, edit),
    width = Math.floor(dimensions.width / 2) * 2,
    height = Math.floor(dimensions.height / 2) * 2;
  clips.forEach((clip, index) => {
    const recipe = {
      ...clipRecipe(edit, clip),
      overlays: defaultOverlays(),
      subtitles: { mode: 'none' as const, cues: [] },
      effectInstances: extraInstances(clipRecipe(edit, clip)).filter(
        (instance) =>
          definitionFor(instance.effect).scope === 'clip' &&
          (!instance.timeSpace || clipStageEffect(instance.effect)),
      ),
    };
    const resources = {
      ...paths,
      lut:
        clip.effects.color?.lut || extraInstances(recipe, 'color').length
          ? `${paths.lut}-clip${index}.cube`
          : paths.lut,
    };
    const trim = `start=${clip.start - edit.start}:end=${clip.end - edit.start}`;
    if (video)
      graph.push(
        `[${input}:V:0]trim=${trim},setpts=PTS-STARTPTS,${[...videoFilters(asset, recipe, resources), `scale=${width}:${height}:force_original_aspect_ratio=decrease`, `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`, 'setsar=1', 'format=yuv420p', 'settb=AVTB'].join(',')}[${prefix}${index}v]`,
      );
    if (audio)
      graph.push(
        `[${input}:a:0]atrim=${trim},asetpts=PTS-STARTPTS,${[...audioFilters(recipe, asset), 'aresample=48000', 'aformat=sample_fmts=fltp'].join(',')}[${prefix}${index}a]`,
      );
  });
  graph.push(
    `${clips.map((_, i) => `${video ? `[${prefix}${i}v]` : ''}${audio ? `[${prefix}${i}a]` : ''}`).join('')}concat=n=${clips.length}:v=${video ? 1 : 0}:a=${audio ? 1 : 0}${video ? `[${prefix}joinedv]` : ''}${audio ? `[${prefix}joineda]` : ''}`,
  );
  const shared = {
    ...edit,
    clips: clips.map((clip) => ({
      ...clip,
      effects: {
        ...clip.effects,
        speed: effectiveSpeed(clipRecipe(edit, clip)),
        effectInstances: [],
      },
    })),
    effectInstances: extraInstances(edit).filter(
      (instance) =>
        definitionFor(instance.effect).scope === 'source' ||
        instance.effect.includes('Fade') ||
        (instance.timeSpace === 'output' && !clipStageEffect(instance.effect)),
    ),
    speed: 1,
    crop: null,
    geometry: defaultGeometry(),
    color: defaultColor(),
    volume: 1,
    normalizeLoudness: false,
    reduceNoise: false,
    equalizer: { bass: 0, mid: 0, treble: 0 },
  };
  if (video)
    graph.push(
      `[${prefix}joinedv]${videoFilters({ ...asset, width, height }, shared, paths).join(',') || 'null'}[${prefix}v]`,
    );
  if (audio) graph.push(`[${prefix}joineda]${audioFilters(shared, asset).join(',')}[${prefix}a]`);
  return { graph };
}
