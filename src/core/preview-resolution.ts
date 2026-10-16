import { extraInstances } from './effect-instances';
import type { EditSettings, MediaAsset } from './types';

/** Work on playback pixels before expensive filters; exports retain source resolution. */
export function previewResolution(asset: MediaAsset, edit: EditSettings) {
  const ratio = Math.min(1, 720 / Math.max(asset.width ?? 720, asset.height ?? 720));
  const geometry = [edit, ...(edit.clips?.map((clip) => clip.effects) ?? [])].some(
    (recipe) =>
      recipe.crop ||
      recipe.geometry?.rotation ||
      recipe.geometry?.resize ||
      recipe.geometry?.flipHorizontal ||
      recipe.geometry?.flipVertical ||
      extraInstances(recipe).some((instance) => ['crop', 'transform'].includes(instance.effect)),
  );
  if (
    asset.kind !== 'video' ||
    edit.mediaLayers?.length ||
    geometry ||
    ratio === 1 ||
    !asset.width ||
    !asset.height
  )
    return { asset, edit, scale: '' };
  const width = Math.max(2, Math.floor((asset.width! * ratio) / 2) * 2),
    height = Math.max(2, Math.floor((asset.height! * ratio) / 2) * 2);
  const visual = (value: EditSettings['visual']) =>
    value
      ? {
          ...value,
          blur: value.blur * ratio,
          pixelate: Math.max(1, Math.round(value.pixelate * ratio)),
        }
      : value;
  const settings = (value: Partial<EditSettings>): Partial<EditSettings> => ({
    ...value,
    ...(value.visual ? { visual: visual(value.visual) } : {}),
    ...(value.effectInstances
      ? {
          effectInstances: extraInstances(value).map((instance) => ({
            ...instance,
            settings: settings(instance.settings),
          })),
        }
      : {}),
  });
  return {
    asset: { ...asset, width, height },
    edit: {
      ...edit,
      ...settings(edit),
      clips: edit.clips?.map((clip) => ({ ...clip, effects: settings(clip.effects) })),
    },
    scale: `scale=${width}:${height},setsar=1`,
  };
}
