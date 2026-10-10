import { activeAtSource } from './timed-adjustments';
import { extraInstances, instanceRecipe } from './effect-instances';
import type { EditSettings, MediaAsset } from './types';
type Matrix = [number, number, number, number, number, number];
const multiply = (m: Matrix, n: Matrix): Matrix => [m[0]*n[0]+m[2]*n[1], m[1]*n[0]+m[3]*n[1], m[0]*n[2]+m[2]*n[3], m[1]*n[2]+m[3]*n[3], m[0]*n[4]+m[2]*n[5]+m[4], m[1]*n[4]+m[3]*n[5]+m[5]];
/** Map the original picture through each crop/transform, in the same order as FFmpeg. */
export function stackedGeometryPreview(asset: MediaAsset, edit: EditSettings) {
  let width = asset.width ?? 640, height = asset.height ?? 360, matrix: Matrix = [1,0,0,1,0,0];
  const stages = [{ crop: edit.crop, geometry: edit.geometry }, ...extraInstances(edit).filter(item => ['crop', 'transform'].includes(item.effect)).map(instance => ({ crop: instance.effect === 'crop' ? instance.settings.crop : null, geometry: instance.effect === 'transform' ? instance.settings.geometry : undefined }))];
  const apply = (next: Matrix) => { matrix = multiply(next, matrix); };
  for (const stage of stages) {
    if (stage.crop) { apply([1,0,0,1,-stage.crop.x,-stage.crop.y]); width = stage.crop.width; height = stage.crop.height; }
    const geometry = stage.geometry; if (!geometry) continue;
    if (geometry.rotation === 90) { apply([0,1,-1,0,height,0]); [width,height] = [height,width]; }
    if (geometry.rotation === 180) apply([-1,0,0,-1,width,height]);
    if (geometry.rotation === 270) { apply([0,-1,1,0,0,width]); [width,height] = [height,width]; }
    if (geometry.flipHorizontal) apply([-1,0,0,1,width,0]);
    if (geometry.flipVertical) apply([1,0,0,-1,0,height]);
    if (geometry.resize) {
      const target = geometry.resize, stretch = target.fit === 'stretch';
      const scale = target.fit === 'cover' ? Math.max(target.width / width, target.height / height) : Math.min(target.width / width, target.height / height);
      const x = stretch ? target.width / width : scale, y = stretch ? target.height / height : scale;
      apply([x,0,0,y,(target.width-width*x)/2,(target.height-height*y)/2]); width = target.width; height = target.height;
    }
  }
  const sw = asset.width ?? 640, sh = asset.height ?? 360;
  // Translation expressed in original element pixels scales with the responsive element.
  const [a,b,c,d,x,y] = matrix;
  return { position: 'absolute' as const, left: `${x/width*100}%`, top: `${y/height*100}%`, width: `${sw/width*100}%`, height: `${sh/height*100}%`, maxWidth: 'none', maxHeight: 'none', objectFit: 'fill' as const, transformOrigin: '0 0', transform: `matrix(${a},${b},${c},${d},0,0)` };
}
export function colorPreview(edit: EditSettings, time?: number, outputTime = time) {
  return [...(activeAtSource(edit.effectRanges?.color, time) ? [edit] : []), ...extraInstances(edit, 'color').filter(instance => activeAtSource(instance.range, instance.timeSpace === 'output' ? outputTime : time)).map(instance => instanceRecipe(edit, instance))].map(recipe => `brightness(${1+recipe.color.brightness}) contrast(${recipe.color.contrast}) saturate(${recipe.color.saturation})`).join(' ');
}
