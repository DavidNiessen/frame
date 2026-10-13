import { imageLayerKey } from '../core/image-layers';
import { imageLayerStages } from '../core/image-layer-stages';
import { videoFilters } from '../core/filters';
import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { buildExportArgs } from '../core/export-plan';
import { frameDimensions } from '../core/geometry';
import {
  defaultSettings,
  type EditSettings,
  type MediaAsset,
  type ExportProgress,
} from '../core/types';
import type { RecipeResources } from '../core/resources';
import { encodeBrowserOutput } from './browser-encoding';
export const renderedImagePath = 'edited-image.png';
/** Lossless layer passes avoid WASM crashes when reordering text, artwork and adjustments. */
export async function browserImageEncoding(
  ff: FFmpeg,
  asset: MediaAsset,
  settings: EditSettings,
  input: string,
  resources: RecipeResources,
  progress: (p: ExportProgress) => void,
) {
  if (asset.kind !== 'image' || !videoFilters(asset, settings, resources).length)
    return { asset, settings, input };
  const stages = imageLayerStages(asset, settings, resources);
  let source = input;
  const temporaries: string[] = [];
  try {
    for (const [index, stage] of stages.entries()) {
      if (!videoFilters(stage.source, stage.recipe, stage.paths).length) continue;
      const destination = `image-stage-${index}.png`;
      temporaries.push(destination);
      await encodeBrowserOutput(
        ff,
        'png',
        (_pass, path) =>
          buildExportArgs(
            stage.source,
            {
              ...stage.recipe,
              format: 'png',
              imageLayers: {
                order: [],
                groups: [],
                entries: { [imageLayerKey(stage.effect)]: stage.state },
              },
            },
            source,
            path,
            stage.paths,
          ),
        destination,
        1,
        (p) =>
          progress({
            ...p,
            ratio: (index + p.ratio) / Math.max(1, stages.length),
            message: `Rendering image layer ${index + 1} of ${stages.length}…`,
          }),
      );
      if (source !== input) await ff.deleteFile(source).catch(() => {});
      source = destination;
    }
    if (source === input) return { asset, settings, input };
    await ff.writeFile(renderedImagePath, await ff.readFile(source));
  } finally {
    for (const path of temporaries) await ff.deleteFile(path).catch(() => {});
  }
  const rendered = { ...asset, ...frameDimensions(asset, settings) };
  return {
    asset: rendered,
    input: renderedImagePath,
    settings: {
      ...defaultSettings(rendered),
      format: settings.format,
      imageOutput: settings.imageOutput,
      keepMetadata: settings.keepMetadata,
    },
  };
}
