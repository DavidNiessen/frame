import { curvesFilter } from './curves';
import { preserveImageAlpha } from './image-alpha';
import { visualFilters } from './visual-filters';
import { filterPath, type RecipeResources } from './resources';
import { frameDimensions } from './geometry';
import type { EditSettings, MediaAsset } from './types';
/** Layers use the edited sequence clock, independently of base-source splits or discarded gaps. */
export function mediaLayerFilters(
  asset: MediaAsset,
  edit: EditSettings,
  paths: RecipeResources,
): string[] {
  const dims = frameDimensions(asset, edit);
  return (edit.mediaLayers ?? [])
    .filter(
      (layer) =>
        !layer.hidden && layer.opacity > 0 && layer.start < (asset.kind === 'image' ? 1 : 86400),
    )
    .map((layer) => {
      const path = paths.media?.[layer.id];
      if (!path)
        throw new Error(`Restore “${layer.source.name}” before rendering its visual layer.`);
      const id = layer.id.replace(/[^a-z0-9]/gi, ''),
        width = Math.max(2, Math.round((dims.width * layer.width) / 100)),
        height = Math.max(2, Math.round((dims.height * layer.height) / 100));
      const fit =
        layer.fit === 'stretch'
          ? `scale=${width}:${height}`
          : layer.fit === 'cover'
            ? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`
            : `scale=${width}:${height}:force_original_aspect_ratio=decrease,format=rgba,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black@0`;
      const time =
        layer.source.kind === 'image'
          ? ''
          : `,trim=start=${layer.sourceStart}:end=${layer.sourceEnd},setpts=PTS-STARTPTS+${layer.start}/TB`;
      return `null[base${id}];movie=filename=${filterPath(path)}:dec_threads=1${time},${fit},format=rgba,${[...preserveImageAlpha([...curvesFilter(layer.curves), ...visualFilters(layer.visual)], 'layer' + id), `colorchannelmixer=aa=${layer.opacity}`].join(',')}[track${id}];[base${id}][track${id}]overlay=x=W*${layer.x / 100}:y=H*${layer.y / 100}:format=auto:eof_action=${layer.source.kind === 'image' ? 'repeat' : 'pass'}:repeatlast=${layer.source.kind === 'image' ? 1 : 0}${asset.kind === 'image' ? '' : `:enable='gte(t,${layer.start})*lt(t,${layer.end})'`}`;
    });
}
