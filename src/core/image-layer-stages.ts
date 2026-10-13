import { imageMaskPath } from './image-masks';
import { imageLayerRows } from './image-layers';
import { extraInstances } from './effect-instances';
import { frameDimensions } from './geometry';
import { defaultSettings, type EditSettings, type MediaAsset } from './types';
import { defaultVisual, isVisualEffect } from './visual-settings';
import { instancePaths, type RecipeResources } from './resources';
/** Each layer owns one adjustment; geometry always establishes the canvas first. */
export function imageLayerStages(
  asset: MediaAsset,
  edit: EditSettings,
  resources: RecipeResources,
) {
  let canvas = asset;
  return imageLayerRows(asset, edit)
    .filter((row) => !row.hidden)
    .map((row) => {
      const instance = row.id ? extraInstances(edit).find((item) => item.id === row.id) : undefined;
      const paths = {
        ...(instance ? instancePaths(resources, instance) : resources),
        mask: imageMaskPath(resources, row.key),
      };
      const recipe: EditSettings = {
        ...defaultSettings(canvas),
        ...Object.fromEntries(row.effect.keys.map((key) => [key, row.recipe[key]])),
        effectInstances: [],
        imageLayers: undefined,
      };
      if (isVisualEffect(row.effect.id))
        recipe.visual = {
          ...defaultVisual(),
          [row.effect.id]: row.recipe.visual?.[row.effect.id] ?? defaultVisual()[row.effect.id],
        };
      const source = canvas;
      if (row.fixed) canvas = { ...canvas, ...frameDimensions(canvas, recipe) };
      return {
        source,
        recipe,
        paths,
        key: row.key,
        effect: row.effect.id,
        state: row.state,
        object: ['painting', 'watermark', 'captions', 'shape', 'retouch'].includes(row.effect.id),
      };
    });
}
