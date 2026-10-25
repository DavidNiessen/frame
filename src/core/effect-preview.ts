import { defaultCurves, hasCurves } from './curves';
import { defaultPainting } from './painting';
import { defaultVisual, hasVisualAdjustments, isVisualEffect } from './visual-settings';
import { defaultColor } from './color';
import { framePreviewArgs } from './frame-preview';
import { editClips, clipRecipe } from './clips';
import {
  allAudioLayers,
  effectiveSpeed,
  extraInstances,
  instanceRecipe,
  type EffectInstance,
} from './effect-instances';
import { defaultGeometry } from './geometry';
import { defaultOverlays } from './overlays';
import { defaultSettings, type EditSettings, type MediaAsset } from './types';
import { buildExportArgs } from './export-plan';
import type { AudioLayerInput } from './audio-layers';
import type { RecipeResources } from './resources';
import type { PreviewRange } from './preview-clock';
import { previewResolution } from './preview-resolution';
import { seekPreviewClips } from './preview-seeking';

/**
 * These corrections cannot be represented by a media element or CSS alone.
 * With real-time grading, color, curves, LUTs and visual adjustments run on the
 * GPU during playback, so they never require a rendered preview. Audio and
 * video are reported separately so audio-only changes skip the video encode.
 */
export function effectPreviewNeeds(
  edit: EditSettings,
  realtimeAudio = false,
  realtimeVideo = false,
  liveLayers = false,
  realtimeNoise = false,
) {
  const audioNeeds = (view: EditSettings) =>
    view.normalizeLoudness ||
    (!realtimeNoise && view.reduceNoise) ||
    (!realtimeAudio &&
      (view.volume > 1 || Object.values(view.equalizer).some((value) => value !== 0)));
  const videoNeeds = (view: EditSettings) =>
    !realtimeVideo &&
    (hasCurves(view.curves) ||
      hasVisualAdjustments(view.visual) ||
      view.color.lut !== null ||
      view.color.temperature !== 0 ||
      view.color.brightness !== 0 ||
      view.color.contrast !== 1 ||
      view.color.saturation !== 1);
  const audioEffects = new Set([
    'normalize',
    ...(realtimeNoise ? [] : ['noise']),
    ...(realtimeAudio ? [] : ['volume', 'equalizer']),
  ]);
  const stack =
    (needs: (view: EditSettings) => boolean, relevant: (instance: EffectInstance) => boolean) =>
    (recipe: EditSettings) =>
      needs(recipe) ||
      extraInstances(recipe).some(
        (instance) => relevant(instance) && needs(instanceRecipe(recipe, instance)),
      );
  const anyClip = (needs: (recipe: EditSettings) => boolean) =>
    needs(edit) || editClips(edit).some((clip) => needs(clipRecipe(edit, clip)));
  return {
    audio:
      allAudioLayers(edit).length > 0 ||
      anyClip(stack(audioNeeds, (instance) => audioEffects.has(instance.effect))),
    video:
      (!liveLayers && !!edit.mediaLayers?.length) ||
      anyClip(
        stack(
          videoNeeds,
          (instance) =>
            instance.effect === 'color' ||
            instance.effect === 'curves' ||
            instance.settings.visual !== undefined,
        ),
      ),
  };
}
const noiseReducing = new WeakMap<EditSettings, boolean>();
/** Whether noise reduction applies anywhere in the edit, which keeps the live reducer in the audio path. */
export function reducesNoise(edit: EditSettings) {
  let result = noiseReducing.get(edit);
  if (result === undefined) {
    const reduces = (recipe: EditSettings) =>
      recipe.reduceNoise ||
      extraInstances(recipe, 'noise').some(
        (instance) => instanceRecipe(recipe, instance).reduceNoise,
      );
    result = reduces(edit) || editClips(edit).some((clip) => reduces(clipRecipe(edit, clip)));
    noiseReducing.set(edit, result);
  }
  return result;
}
export function needsEffectPreview(
  edit: EditSettings,
  realtimeAudio = false,
  realtimeVideo = false,
) {
  const needs = effectPreviewNeeds(edit, realtimeAudio, realtimeVideo);
  return needs.audio || needs.video;
}
const liveVisual = new Set([
  'painting',
  'shape',
  'crop',
  'transform',
  'captions',
  'watermark',
  'videoFadeIn',
  'videoFadeOut',
]);
const gradeEffect = (effect: string) =>
  effect === 'color' || effect === 'curves' || isVisualEffect(effect);
/**
 * Keep frame objects/geometry/fades interactive; bake the complete audio mix.
 * Exact color is baked unless `realtimeVideo` grades it live. Media layers
 * composited by FFmpeg bake geometry and color; `liveLayers` leaves them to the
 * renderer instead.
 */
export function effectPreviewRecipe(
  asset: MediaAsset,
  edit: EditSettings,
  realtimeVideo = false,
  liveLayers = false,
): EditSettings {
  if (asset.kind === 'image') return { ...edit, format: 'png' };
  const dropLayers = liveLayers || asset.kind === 'audio',
    bakeGeometry = !dropLayers && !!edit.mediaLayers?.length,
    liveGrade = realtimeVideo && !bakeGeometry;
  const keepInstance = (instance: EffectInstance) =>
    (!liveVisual.has(instance.effect) ||
      (bakeGeometry && ['crop', 'transform'].includes(instance.effect))) &&
    instance.effect !== 'mix' &&
    !(liveGrade && gradeEffect(instance.effect));
  const grade = (recipe: Partial<EditSettings>): Partial<EditSettings> =>
    liveGrade
      ? {
          ...('color' in recipe ? { color: defaultColor() } : {}),
          ...('curves' in recipe ? { curves: defaultCurves() } : {}),
          ...('visual' in recipe ? { visual: defaultVisual() } : {}),
          ...(recipe.effectRanges
            ? {
                effectRanges: Object.fromEntries(
                  Object.entries(recipe.effectRanges).filter(([id]) => !gradeEffect(id)),
                ),
              }
            : {}),
        }
      : {};
  const strip = (recipe: EditSettings): EditSettings => ({
    ...recipe,
    ...grade(recipe),
    painting: defaultPainting(),
    shape: null,
    crop: bakeGeometry ? recipe.crop : null,
    geometry: bakeGeometry ? recipe.geometry : defaultGeometry(),
    subtitles: { mode: 'none', cues: [] },
    overlays: defaultOverlays(),
    videoFadeIn: 0,
    videoFadeOut: 0,
    addedEffects: undefined,
    effectInstances: extraInstances(recipe).filter(keepInstance),
  });
  const result: EditSettings = {
    ...strip(edit),
    mediaLayers: dropLayers ? undefined : edit.mediaLayers,
    format: asset.kind === 'video' ? 'mp4' : 'mp3',
    quality: 'balanced',
    acceleration: defaultSettings(asset).acceleration,
    targetSizeMb: null,
    videoBitrate: null,
    audioBitrate: 192,
    audioSampleRate: 48000,
    audioChannels: 2,
    wavDepth: 16,
    fps: 30,
    gifLoop: 0,
    gifColors: 256,
    gifDither: 'sierra2_4a',
    gifWidth: null,
    includeArtwork: false,
    keepMetadata: false,
    includeChapters: false,
    markers: [],
    splits: [],
    customArtwork: null,
    outputTags: undefined,
    audioLayers: allAudioLayers(edit),
    clips: edit.clips?.map((clip) => ({
      id: clip.id,
      start: clip.start,
      end: clip.end,
      effects: {
        ...clip.effects,
        ...grade(clip.effects),
        painting: defaultPainting(),
        shape: null,
        crop: bakeGeometry
          ? clip.effects.crop !== undefined
            ? clip.effects.crop
            : edit.crop
          : null,
        geometry: bakeGeometry ? (clip.effects.geometry ?? edit.geometry) : defaultGeometry(),
        videoFadeIn: 0,
        videoFadeOut: 0,
        addedEffects: undefined,
        effectInstances: clip.effects.effectInstances?.filter(keepInstance),
      },
    })),
  };
  // Splitting unchanged footage must not multiply decoder/filter branches or
  // invalidate an otherwise identical preview. Keep local fades independent.
  result.clips = result.clips?.reduce<NonNullable<EditSettings['clips']>>((clips, clip) => {
    const previous = clips.at(-1);
    const localFade = (value: typeof clip) =>
      ['audioFadeIn', 'audioFadeOut'].some((key) => !!value.effects[key as 'audioFadeIn']) ||
      value.effects.effectInstances?.some((instance) => instance.effect.includes('Fade'));
    if (
      previous &&
      Math.abs(previous.end - clip.start) < 1e-8 &&
      !localFade(previous) &&
      !localFade(clip) &&
      JSON.stringify(previous.effects) === JSON.stringify(clip.effects)
    )
      previous.end = clip.end;
    else clips.push({ ...clip, id: `preview-${clips.length}`, effects: clip.effects });
    return clips;
  }, []);
  return result;
}
export const effectPreviewRanges = (edit: EditSettings): PreviewRange[] =>
  editClips(edit).map((clip) => ({
    start: clip.start,
    end: clip.end,
    speed: effectiveSpeed(clipRecipe(edit, clip)),
  }));

/** Reuse final processing at a smaller playback resolution, without changing the saved recipe. */
export function effectPreviewArgs(
  asset: MediaAsset,
  edit: EditSettings,
  input: string,
  output: string,
  resources: RecipeResources,
  layers: AudioLayerInput[] = [],
) {
  if (asset.kind === 'image') return framePreviewArgs(asset, edit, 0, input, output, resources);
  const preview = previewResolution(asset, edit);
  const args = buildExportArgs(preview.asset, preview.edit, input, output, resources, layers);
  if (preview.scale) {
    const graph = args.indexOf('-filter_complex');
    // Clip branches scale after trimming, before their correction stacks.
    if (graph >= 0 && edit.clips) {
      args[graph + 1] = args[graph + 1].replace(
        /(\[0:V:0\]trim=[^;]*?,setpts=PTS-STARTPTS,)/g,
        `$1${preview.scale},`,
      );
    } else if (graph >= 0 && args[graph + 1].includes('[joinedv]')) {
      args[graph + 1] = args[graph + 1].replace(/\[joinedv\](?=\w)/, `[joinedv]${preview.scale},`);
    } else {
      const filter = args.indexOf('-vf');
      if (filter >= 0) args[filter + 1] = `${preview.scale},${args[filter + 1]}`;
    }
  }
  if (asset.kind === 'video') {
    const scale =
      "scale=w='min(720,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1";
    const graph = args.indexOf('-filter_complex'),
      map = args.indexOf('-map');
    if (graph >= 0) {
      const videoInput = args[map + 1].startsWith('[') ? args[map + 1] : `[${args[map + 1]}]`;
      const filter = args.indexOf('-vf'),
        pipeline = filter >= 0 ? `${args[filter + 1]},${scale}` : scale;
      args[graph + 1] += `;${videoInput}${pipeline}[previewvideo]`;
      args[map + 1] = '[previewvideo]';
      // A mixed audio graph can still have simple video filters from the export planner.
      if (filter >= 0) args.splice(filter, 2);
    } else {
      const filter = args.indexOf('-vf');
      if (filter >= 0) args[filter + 1] += `,${scale}`;
      else args.splice(args.length - 1, 0, '-vf', scale);
    }
    const preset = args.indexOf('-preset');
    if (preset >= 0) args[preset + 1] = 'ultrafast';
    args.splice(args.length - 1, 0, '-r', String(Math.min(30, asset.frameRate ?? 30)));
  }
  return seekPreviewClips(args, edit, input);
}
/** Audio-only renders read the soundtrack of a video source without re-encoding its picture. */
export const audioPreviewAsset = (asset: MediaAsset): MediaAsset =>
  asset.kind === 'video' ? { ...asset, kind: 'audio' } : asset;
