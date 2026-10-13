import { hasCurves } from './curves';
import { defaultPainting } from './painting';
import { hasVisualAdjustments } from './visual-settings';
import { framePreviewArgs } from './frame-preview';
import { editClips, clipRecipe } from './clips';
import { allAudioLayers, effectiveSpeed, extraInstances, instanceRecipe } from './effect-instances';
import { defaultGeometry } from './geometry';
import { defaultOverlays } from './overlays';
import { defaultSettings, type EditSettings, type MediaAsset } from './types';
import { buildExportArgs } from './export-plan';
import type { AudioLayerInput } from './audio-layers';
import type { RecipeResources } from './resources';
import type { PreviewRange } from './preview-clock';

/** These corrections cannot be represented by a media element or CSS alone. */
export function needsEffectPreview(edit: EditSettings) {
  const recipes = [edit, ...editClips(edit).map((clip) => clipRecipe(edit, clip))];
  return (
    allAudioLayers(edit).length > 0 ||
    recipes.some((recipe) =>
      [recipe, ...extraInstances(recipe).map((instance) => instanceRecipe(recipe, instance))].some(
        (view) =>
          hasCurves(view.curves) ||
          hasVisualAdjustments(view.visual) ||
          view.normalizeLoudness ||
          view.reduceNoise ||
          view.volume > 1 ||
          Object.values(view.equalizer).some((value) => value !== 0) ||
          view.color.lut !== null ||
          view.color.temperature !== 0 ||
          view.color.brightness !== 0 ||
          view.color.contrast !== 1 ||
          view.color.saturation !== 1,
      ),
    )
  );
}
const liveVisual = new Set([
  'painting',
  'crop',
  'transform',
  'captions',
  'watermark',
  'videoFadeIn',
  'videoFadeOut',
]);
/** Keep frame objects/geometry/fades interactive; bake exact color and the complete audio mix. */
export function effectPreviewRecipe(asset: MediaAsset, edit: EditSettings): EditSettings {
  if (asset.kind === 'image') return { ...edit, format: 'png' };
  const strip = (recipe: EditSettings): EditSettings => ({
    ...recipe,
    painting: defaultPainting(),
    crop: null,
    geometry: defaultGeometry(),
    subtitles: { mode: 'none', cues: [] },
    overlays: defaultOverlays(),
    videoFadeIn: 0,
    videoFadeOut: 0,
    addedEffects: undefined,
    effectInstances: extraInstances(recipe).filter(
      (instance) => !liveVisual.has(instance.effect) && instance.effect !== 'mix',
    ),
  });
  return {
    ...strip(edit),
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
    customArtwork: null,
    outputTags: undefined,
    audioLayers: allAudioLayers(edit),
    clips: edit.clips?.map((clip) => ({
      id: clip.id,
      start: clip.start,
      end: clip.end,
      effects: {
        ...clip.effects,
        painting: defaultPainting(),
        crop: null,
        geometry: defaultGeometry(),
        videoFadeIn: 0,
        videoFadeOut: 0,
        addedEffects: undefined,
        effectInstances: clip.effects.effectInstances?.filter(
          (instance) => !liveVisual.has(instance.effect) && instance.effect !== 'mix',
        ),
      },
    })),
  };
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
  const args = buildExportArgs(asset, edit, input, output, resources, layers);
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
  return args;
}
