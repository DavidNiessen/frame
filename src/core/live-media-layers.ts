import { clipRecipe, editClips } from './clips';
import { extraInstances } from './effect-instances';
import { defaultGeometry } from './geometry';
import { mediaLayerSource } from './media-layers';
import type { EditSettings, MediaAsset } from './types';

const identity = JSON.stringify(defaultGeometry());
/**
 * Layers are measured against the output frame. The preview can place them in a
 * simple crop, but rotated, flipped, resized or stacked crops change the frame.
 */
const plainFrame = (recipe: EditSettings) =>
  JSON.stringify(recipe.geometry ?? defaultGeometry()) === identity &&
  !extraInstances(recipe).some(
    (instance) =>
      instance.effect === 'transform' ||
      (instance.effect === 'crop' && (instance.timeSpace !== 'output' || !!recipe.crop)),
  );
const gif = (name: string) => /\.gif$/i.test(name);

/**
 * Whether the preview can composite video and image layers live, above the
 * playing video, instead of rendering the whole composition with FFmpeg.
 * Layer grading uses the GPU, so it requires real-time grading.
 */
export function liveMediaLayers(
  asset: MediaAsset,
  edit: EditSettings,
  assets: MediaAsset[],
  realtimeVideo: boolean,
) {
  const layers = edit.mediaLayers ?? [];
  return (
    realtimeVideo &&
    asset.kind === 'video' &&
    !gif(asset.name) &&
    layers.length > 0 &&
    plainFrame(edit) &&
    editClips(edit).every((clip) => plainFrame(clipRecipe(edit, clip))) &&
    layers.every((layer) => {
      if (layer.hidden) return true;
      const source = mediaLayerSource(layer, assets);
      return !!source?.previewUrl && !gif(source.name);
    })
  );
}
