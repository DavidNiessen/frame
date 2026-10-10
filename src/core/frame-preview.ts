import { clipAtSource, clipRecipe } from './clips';
import { validateEdit } from './export-plan';
import { videoFilters } from './filters';
import { outputTimeAtSource, fadeFilters } from './fades';
import { resourcePaths, type RecipeResources } from './resources';
import type { EditSettings, MediaAsset } from './types';
export function framePreviewArgs(asset: MediaAsset, edit: EditSettings, time: number, input: string, output: string, paths: RecipeResources = resourcePaths()): string[] {
  validateEdit(asset, edit);
  if (asset.kind !== 'video' || !Number.isFinite(time) || time < 0 || time >= asset.duration) throw new Error('Choose a frame inside the video.');
  const clip = clipAtSource(edit, time), scoped = edit.clips && clip ? clipRecipe(edit, clip) : edit;
  const visual = { ...scoped, effectInstances: [...(scoped.effectInstances ?? []).filter(instance => instance.effect !== 'speed'), ...(edit.clips ? (edit.effectInstances ?? []).filter(instance => instance.timeSpace === 'output' && instance.effect.startsWith('videoFade')) : [])], speed: 1, videoFadeIn: 0, videoFadeOut: 0 };
  const filters = [`setpts=PTS-STARTPTS+${outputTimeAtSource(edit, time)}/TB`, ...videoFilters(asset, visual, edit.clips && clip?.effects.color?.lut ? { ...paths, lut: `${paths.lut}-clip${edit.clips.indexOf(clip)}.cube` } : paths, edit), ...fadeFilters(scoped, 'video'), 'scale=720:720:force_original_aspect_ratio=decrease'];
  return ['-y', '-ss', String(time), '-i', input, '-map', '0:V:0', '-vf', filters.join(','), '-frames:v', '1', '-an', '-c:v', 'png', '-pix_fmt', 'rgba', '-threads', '1', '-update', '1', output];
}
