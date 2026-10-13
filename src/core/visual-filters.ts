import { parseVisual } from './visual-settings';
import type { VisualSettings } from './visual-settings';
/** All filters run in the same order in the canvas, video preview and final export. */
export function visualFilters(settings?: VisualSettings): string[] {
  const v = parseVisual(settings),
    filters: string[] = [];
  if (v.exposure) filters.push(`exposure=exposure=${v.exposure}`);
  if (v.gamma !== 1) filters.push(`eq=gamma=${v.gamma}`);
  if (v.shadows || v.highlights) {
    const curve = `clip(val+${v.shadows}*64*pow(1-val/255,2)+${v.highlights}*64*pow(val/255,2),0,255)`;
    filters.push(`lutrgb=r='${curve}':g='${curve}':b='${curve}'`);
  }
  if (v.vibrance) filters.push(`vibrance=intensity=${v.vibrance}`);
  if (v.hue) filters.push(`hue=h=${v.hue}`);
  if (v.tint)
    filters.push(`colorbalance=rm=${v.tint * 0.2}:gm=${-v.tint * 0.2}:bm=${v.tint * 0.2}`);
  if (v.vignette) filters.push(`vignette=angle=${(v.vignette * Math.PI) / 3}`);
  if (v.blur) filters.push(`gblur=sigma=${v.blur}`);
  if (v.sharpen) filters.push(`unsharp=5:5:${v.sharpen}:5:5:0`);
  if (v.grayscale) filters.push(`hue=s=${1 - v.grayscale}`);
  if (v.sepia) {
    const a = v.sepia;
    filters.push(
      `colorchannelmixer=rr=${1 - a + 0.393 * a}:rg=${0.769 * a}:rb=${0.189 * a}:gr=${0.349 * a}:gg=${1 - a + 0.686 * a}:gb=${0.168 * a}:br=${0.272 * a}:bg=${0.534 * a}:bb=${1 - a + 0.131 * a}`,
    );
  }
  if (v.invert) filters.push('negate');
  if (v.pixelate > 1) filters.push(`pixelize=width=${v.pixelate}:height=${v.pixelate}:mode=avg`);
  if (v.posterize !== 256) {
    const curve = `round(val/255*${v.posterize - 1})*255/${v.posterize - 1}`;
    filters.push(`lutrgb=r='${curve}':g='${curve}':b='${curve}'`);
  }
  if (v.grain) filters.push(`noise=alls=${v.grain}:allf=u:all_seed=42`);
  if (v.sketch) filters.push('edgedetect=low=0.05:high=0.2', 'negate');
  if (v.emboss)
    filters.push(
      "convolution=0m='-2 -1 0 -1 1 1 0 1 2':1m='-2 -1 0 -1 1 1 0 1 2':2m='-2 -1 0 -1 1 1 0 1 2':0rdiv=1:1rdiv=1:2rdiv=1:0bias=128:1bias=128:2bias=128",
    );
  return filters;
}
