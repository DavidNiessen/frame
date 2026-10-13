import { defaultPainting, parsePainting, type PaintPoint, type PaintStroke } from './painting';
import { filterPath, type RecipeResources } from './resources';
export interface CutoutSettings {
  image: string | null;
  revision: number;
  background: 'edges' | 'sample';
  sample: PaintPoint | null;
  tolerance: number;
  feather: number;
  contiguous: boolean;
  strokes: PaintStroke[];
  tool: 'remove' | 'restore' | 'sample';
  size: number;
}
export const defaultCutout = (): CutoutSettings => ({
  image: null,
  revision: 0,
  background: 'edges',
  sample: null,
  tolerance: 0.12,
  feather: 0.002,
  contiguous: true,
  strokes: [],
  tool: 'remove',
  size: 0.04,
});
export function parseCutout(input: unknown): CutoutSettings {
  if (input === undefined) return defaultCutout();
  const v = input as CutoutSettings;
  if (
    !v ||
    !['edges', 'sample'].includes(v.background) ||
    !['remove', 'restore', 'sample'].includes(v.tool) ||
    ![v.tolerance, v.feather, v.size].every(Number.isFinite) ||
    v.tolerance < 0 ||
    v.tolerance > 0.8 ||
    v.feather < 0 ||
    v.feather > 0.04 ||
    v.size < 0.001 ||
    v.size > 0.2 ||
    typeof v.contiguous !== 'boolean' ||
    !Number.isInteger(v.revision) ||
    v.revision < 0 ||
    v.revision > 1_000_000_000 ||
    (v.sample !== null &&
      (!v.sample ||
        ![v.sample.x, v.sample.y].every(Number.isFinite) ||
        v.sample.x < 0 ||
        v.sample.x > 1 ||
        v.sample.y < 0 ||
        v.sample.y > 1))
  )
    throw new Error('Invalid background removal settings.');
  const painting = parsePainting({ ...defaultPainting(), image: v.image, strokes: v.strokes });
  return { ...v, image: painting.image, strokes: painting.strokes };
}
export function cutoutFilters(
  value: CutoutSettings | undefined,
  paths: RecipeResources,
  prefix: string,
  width: number,
  height: number,
) {
  if (!value?.image) return [];
  const id = prefix.replace(/[^a-z0-9]/gi, '');
  return [
    `format=rgba,split[photo${id}][alpha${id}];[alpha${id}]alphaextract[originalAlpha${id}];movie=filename=${filterPath(paths.image + '-cutout.png')}:dec_threads=1,scale=${width}:${height},format=rgba,alphaextract[mask${id}];[originalAlpha${id}][mask${id}]blend=all_mode=multiply[cutAlpha${id}];[photo${id}]format=rgb24[color${id}];[color${id}][cutAlpha${id}]alphamerge`,
  ];
}
