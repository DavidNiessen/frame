export const curveChannels = ['master', 'red', 'green', 'blue'] as const;
export type CurveChannel = (typeof curveChannels)[number];
export interface CurvePoint {
  x: number;
  y: number;
}
export type Curves = Record<CurveChannel, CurvePoint[]>;
export const defaultCurves = (): Curves =>
  Object.fromEntries(
    curveChannels.map((c) => [
      c,
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    ]),
  ) as Curves;
export function parseCurves(input: unknown): Curves {
  if (input === undefined) return defaultCurves();
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => !curveChannels.includes(k as CurveChannel))
  )
    throw new Error('Invalid color curves.');
  const result = defaultCurves();
  for (const channel of curveChannels) {
    const points = (input as Curves)[channel] ?? result[channel];
    if (
      !Array.isArray(points) ||
      points.length < 2 ||
      points.length > 16 ||
      points[0]?.x !== 0 ||
      points.at(-1)?.x !== 1 ||
      points.some(
        (p, i) =>
          !p ||
          ![p.x, p.y].every((n) => Number.isFinite(n) && n >= 0 && n <= 1) ||
          (i > 0 && p.x - points[i - 1].x < 0.002),
      )
    )
      throw new Error('Curves need 2–16 ordered points, from black to white.');
    result[channel] = points.map((p) => ({ x: p.x, y: p.y }));
  }
  return result;
}
export const hasCurves = (input?: Curves) =>
  input && curveChannels.some((c) => input[c].some((p) => p.x !== p.y));
export function curvesFilter(input?: Curves): string[] {
  const curves = parseCurves(input);
  if (!hasCurves(curves)) return [];
  return [
    `curves=${curveChannels.map((channel) => `${channel}='${curves[channel].map((p) => `${p.x}/${p.y}`).join(' ')}'`).join(':')}`,
  ];
}
/** Natural cubic splines, matching FFmpeg's default curves interpolation. */
export function curveSamples(points: CurvePoint[], count = 256): number[] {
  const n = points.length,
    second = new Array<number>(n).fill(0),
    u = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const h = points[i + 1].x - points[i - 1].x,
      sig = (points[i].x - points[i - 1].x) / h,
      p = sig * second[i - 1] + 2;
    second[i] = (sig - 1) / p;
    u[i] =
      ((6 *
        ((points[i + 1].y - points[i].y) / (points[i + 1].x - points[i].x) -
          (points[i].y - points[i - 1].y) / (points[i].x - points[i - 1].x))) /
        h -
        sig * u[i - 1]) /
      p;
  }
  for (let i = n - 2; i >= 0; i--) second[i] = second[i] * second[i + 1] + u[i];
  return Array.from({ length: count }, (_, i) => {
    const x = i / (count - 1);
    let k = 0;
    while (k < n - 2 && points[k + 1].x < x) k++;
    const h = points[k + 1].x - points[k].x,
      a = (points[k + 1].x - x) / h,
      b = (x - points[k].x) / h;
    return Math.max(
      0,
      Math.min(
        1,
        a * points[k].y +
          b * points[k + 1].y +
          (((a * a * a - a) * second[k] + (b * b * b - b) * second[k + 1]) * h * h) / 6,
      ),
    );
  });
}
export interface Histogram {
  red: number[];
  green: number[];
  blue: number[];
  luminance: number[];
}
export function imageHistogram(pixels: Uint8ClampedArray): Histogram {
  const bins = {
    red: new Array<number>(256).fill(0),
    green: new Array<number>(256).fill(0),
    blue: new Array<number>(256).fill(0),
    luminance: new Array<number>(256).fill(0),
  };
  for (let i = 0; i < pixels.length; i += 4) {
    const weight = pixels[i + 3] / 255;
    if (!weight) continue;
    bins.red[pixels[i]] += weight;
    bins.green[pixels[i + 1]] += weight;
    bins.blue[pixels[i + 2]] += weight;
    bins.luminance[
      Math.round(0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2])
    ] += weight;
  }
  return bins;
}
