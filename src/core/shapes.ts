import type { MediaAsset } from './types';
export const shapeKinds = ['rectangle', 'rounded', 'ellipse', 'line', 'arrow'] as const;
export interface ShapeSettings {
  kind: (typeof shapeKinds)[number];
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  cornerRadius: number;
}
export const defaultShape = (): ShapeSettings => ({
  kind: 'rectangle',
  x: 30,
  y: 30,
  width: 40,
  height: 30,
  rotation: 0,
  fill: '#a99bff',
  stroke: '#ffffff',
  strokeWidth: 0.5,
  opacity: 1,
  cornerRadius: 20,
});
export function parseShape(input: unknown): ShapeSettings | null {
  if (input === undefined || input === null) return null;
  const s = input as ShapeSettings;
  if (
    !s ||
    !shapeKinds.includes(s.kind) ||
    ![s.x, s.y, s.width, s.height, s.rotation, s.strokeWidth, s.opacity, s.cornerRadius].every(
      Number.isFinite,
    ) ||
    s.x < 0 ||
    s.y < 0 ||
    s.width < 1 ||
    s.height < 1 ||
    s.x + s.width > 100.00001 ||
    s.y + s.height > 100.00001 ||
    s.rotation < -180 ||
    s.rotation > 180 ||
    s.strokeWidth < 0 ||
    s.strokeWidth > 10 ||
    s.opacity < 0 ||
    s.opacity > 1 ||
    s.cornerRadius < 0 ||
    s.cornerRadius > 50 ||
    ![s.fill, s.stroke].every((c) => typeof c === 'string' && /^#[a-f0-9]{6}$/i.test(c))
  )
    throw new Error('Invalid shape settings.');
  return { ...s };
}
/** Analytic shapes keep desktop and WASM exports independent of SVG/font rasterizers. */
export function shapeFilters(
  asset: MediaAsset,
  input: ShapeSettings | null | undefined,
  prefix: string,
): string[] {
  const s = parseShape(input);
  if (!s || s.opacity === 0) return [];
  const W = asset.width ?? 640,
    H = asset.height ?? 360,
    w = (s.width * W) / 100,
    h = (s.height * H) / 100,
    cx = ((s.x + s.width / 2) * W) / 100,
    cy = ((s.y + s.height / 2) * H) / 100,
    a = (s.rotation * Math.PI) / 180,
    stroke = (s.strokeWidth * W) / 100;
  const U = `((X-${cx})*${Math.cos(a)}+(Y-${cy})*${Math.sin(a)})`,
    V = `(-(X-${cx})*${Math.sin(a)}+(Y-${cy})*${Math.cos(a)})`;
  const rect = (width: number, height: number, radius = 0) =>
    radius > 0
      ? `lte(pow(max(abs(${U})-${Math.max(0, width / 2 - radius)},0),2)+pow(max(abs(${V})-${Math.max(0, height / 2 - radius)},0),2),${radius * radius})`
      : `lte(abs(${U}),${Math.max(0, width / 2)})*lte(abs(${V}),${Math.max(0, height / 2)})`;
  const ellipse = (width: number, height: number) =>
    width <= 0 || height <= 0 ? '0' : `lte(pow(${U}/${width / 2},2)+pow(${V}/${height / 2},2),1)`;
  const radius = (Math.min(w, h) * s.cornerRadius) / 100;
  let inside = s.kind === 'ellipse' ? ellipse(w, h) : rect(w, h, s.kind === 'rounded' ? radius : 0),
    inner =
      s.kind === 'ellipse'
        ? ellipse(w - 2 * stroke, h - 2 * stroke)
        : rect(
            w - 2 * stroke,
            h - 2 * stroke,
            s.kind === 'rounded' ? Math.max(0, radius - stroke) : 0,
          );
  if (s.kind === 'line' || s.kind === 'arrow') {
    inside = rect(w, Math.max(1, stroke));
    inner = inside;
    if (s.kind === 'arrow') {
      const head = Math.min(w * 0.35, Math.max(8, stroke * 6)),
        headHeight = Math.min(h / 2, head);
      inside = `min(1,(${inside})+gte(${U},${w / 2 - head})*lte(${U},${w / 2})*lte(abs(${V}),(${w / 2}-${U})*${headHeight / head}))`;
      inner = inside;
    }
  }
  const border =
    stroke > 0 && !['line', 'arrow'].includes(s.kind) ? `(${inside})*(1-(${inner}))` : '0';
  const component = (index: number) =>
    `if(${border},${parseInt(s.stroke.slice(index, index + 2), 16)},${parseInt(s.fill.slice(index, index + 2), 16)})`;
  const id = prefix.replace(/[^a-z0-9]/gi, '');
  return [
    `format=rgba,split[shapebase${id}][shapeinput${id}];[shapeinput${id}]format=gbrap,geq=r='${component(1)}':g='${component(3)}':b='${component(5)}':a='255*${s.opacity}*(${inside})',format=rgba[shape${id}];[shapebase${id}][shape${id}]overlay=format=auto`,
  ];
}
