import { keyframeExpression } from './keyframes';
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
        !layer.hidden &&
        (layer.opacity > 0 || layer.animation?.opacity) &&
        layer.start < (asset.kind === 'image' ? 1 : 86400),
    )
    .map((layer) => {
      const path = paths.media?.[layer.id];
      if (!path)
        throw new Error(`Restore “${layer.source.name}” before rendering its visual layer.`);
      const id = layer.id.replace(/[^a-z0-9]/gi, ''),
        animated =
          !!layer.animation && Object.values(layer.animation).some((track) => track?.keys.length),
        resize = !!layer.animation?.width || !!layer.animation?.height,
        width = Math.max(2, Math.round((dims.width * layer.width) / 100)),
        height = Math.max(2, Math.round((dims.height * layer.height) / 100)),
        expression = (property: 'x' | 'y' | 'width' | 'height' | 'opacity', variable = 't') =>
          keyframeExpression(layer.animation?.[property], layer[property], variable, layer.start),
        box = (property: 'width' | 'height', variable = 't') =>
          `max(2,min(8192,${dims[property]}*(${expression(property, variable)})/100))`,
        boxW = box('width'),
        boxH = box('height');
      let fit =
        layer.fit === 'stretch'
          ? `scale=${width}:${height}`
          : layer.fit === 'cover'
            ? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`
            : `scale=${width}:${height}:force_original_aspect_ratio=decrease,format=rgba,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black@0`;
      if (resize)
        fit = `scale=w='${boxW}':h='${boxH}':eval=frame${layer.fit === 'stretch' ? '' : `:force_original_aspect_ratio=${layer.fit === 'cover' ? 'increase' : 'decrease'}`}`;
      const time =
          layer.source.kind === 'image'
            ? animated && asset.kind === 'video'
              ? `,loop=loop=-1:size=1:start=0,setpts=N/(${Math.min(30, asset.frameRate ?? 30)}*TB)`
              : ''
            : `,trim=start=${layer.sourceStart}:end=${layer.sourceEnd},setpts=PTS-STARTPTS+${layer.start}/TB`,
        alpha =
          layer.animation?.opacity || (resize && layer.fit === 'cover')
            ? `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(${expression('opacity', 'T')})${resize && layer.fit === 'cover' ? `*between(X,(W-${box('width', 'T')})/2,(W+${box('width', 'T')})/2)*between(Y,(H-${box('height', 'T')})/2,(H+${box('height', 'T')})/2)` : ''}'`
            : `colorchannelmixer=aa=${layer.opacity}`,
        x = `W*(${expression('x')})/100${resize && layer.fit !== 'stretch' ? `+(${boxW}-w)/2` : ''}`,
        y = `H*(${expression('y')})/100${resize && layer.fit !== 'stretch' ? `+(${boxH}-h)/2` : ''}`;
      return `null[base${id}];movie=filename=${filterPath(path)}:dec_threads=1${time},${fit},format=rgba,${[...preserveImageAlpha([...curvesFilter(layer.curves), ...visualFilters(layer.visual)], 'layer' + id), alpha].join(',')}[track${id}];[base${id}][track${id}]overlay=x='${x}':y='${y}':format=auto:eof_action=${layer.source.kind === 'image' ? 'repeat' : 'pass'}:repeatlast=${layer.source.kind === 'image' ? 1 : 0}${asset.kind === 'image' ? '' : `:enable='gte(t,${layer.start})*lt(t,${layer.end})'`}`;
    });
}
