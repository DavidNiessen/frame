import { defaultPainting, parsePainting, type PaintingSettings } from './painting';
import { filterPath, type RecipeResources } from './resources';
export interface ImageMask {
  mode: 'none' | 'rectangle' | 'ellipse' | 'brush';
  x: number;
  y: number;
  width: number;
  height: number;
  feather: number;
  invert: boolean;
  brush: PaintingSettings;
}
export const defaultImageMask = (): ImageMask => ({
  mode: 'none',
  x: 0.2,
  y: 0.2,
  width: 0.6,
  height: 0.6,
  feather: 0.02,
  invert: false,
  brush: { ...defaultPainting(), size: 0.05 },
});
export function parseImageMask(input: unknown): ImageMask {
  if (input === undefined) return defaultImageMask();
  const m = input as ImageMask;
  if (
    !m ||
    !['none', 'rectangle', 'ellipse', 'brush'].includes(m.mode) ||
    ![m.x, m.y, m.width, m.height, m.feather].every(Number.isFinite) ||
    m.x < 0 ||
    m.y < 0 ||
    m.width < 0.01 ||
    m.height < 0.01 ||
    m.x + m.width > 1.000001 ||
    m.y + m.height > 1.000001 ||
    m.feather < 0 ||
    m.feather > 0.2 ||
    typeof m.invert !== 'boolean'
  )
    throw new Error('Invalid image effect mask.');
  return {
    mode: m.mode,
    x: m.x,
    y: m.y,
    width: m.width,
    height: m.height,
    feather: m.feather,
    invert: m.invert,
    brush: parsePainting(m.brush),
  };
}
export const imageMaskPath = (paths: RecipeResources, key: string) =>
  paths.mask ?? `${paths.image}-mask-${key.replace(/[^a-z0-9]/gi, '')}.png`;
/** Build a grayscale selection at the actual canvas size; brush alpha defines coverage. */
export function imageMaskGraph(
  input: string,
  output: string,
  mask: ImageMask,
  width: number,
  height: number,
  path: string,
): string {
  const m = parseImageMask(mask);
  let graph: string;
  if (m.mode === 'brush' && m.brush.image)
    graph = `[${input}]nullsink;movie=filename=${filterPath(path)}:dec_threads=1,scale=${width}:${height},format=rgba,alphaextract`;
  else {
    const shape =
      m.mode === 'rectangle'
        ? `gte(X/W,${m.x})*lt(X/W,${m.x + m.width})*gte(Y/H,${m.y})*lt(Y/H,${m.y + m.height})`
        : m.mode === 'ellipse'
          ? `lte(pow((X/W-${m.x + m.width / 2})/${m.width / 2},2)+pow((Y/H-${m.y + m.height / 2})/${m.height / 2},2),1)`
          : '0';
    graph = `[${input}]format=gray,geq=lum='255*(${shape})'`;
  }
  if (m.feather > 0)
    graph += `,gblur=sigma=${Math.min(1024, m.feather * Math.min(width, height))}:steps=2`;
  if (m.invert) graph += ',negate';
  return `${graph},format=gray[${output}]`;
}
