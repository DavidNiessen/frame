import { defaultPainting, parsePainting, type PaintPoint } from './painting';
export type RetouchMode = 'clone' | 'heal' | 'erase';
export interface RetouchStroke {
  points: PaintPoint[];
  source: PaintPoint;
  mode: RetouchMode;
  size: number;
  hardness: number;
  opacity: number;
}
export interface RetouchSettings {
  strokes: RetouchStroke[];
  image: string | null;
  source: PaintPoint | null;
  mode: RetouchMode;
  size: number;
  hardness: number;
  opacity: number;
}
export const defaultRetouch = (): RetouchSettings => ({
  strokes: [],
  image: null,
  source: null,
  mode: 'clone',
  size: 0.04,
  hardness: 0.4,
  opacity: 1,
});
export function parseRetouch(input: unknown): RetouchSettings {
  if (input === undefined) return defaultRetouch();
  const value = input as RetouchSettings;
  const point = (p: PaintPoint) =>
    p &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    p.x >= 0 &&
    p.x <= 1 &&
    p.y >= 0 &&
    p.y <= 1;
  const brush = (p: RetouchSettings | RetouchStroke) =>
    p &&
    ['clone', 'heal', 'erase'].includes(p.mode) &&
    Number.isFinite(p.size) &&
    p.size >= 0.001 &&
    p.size <= 0.2 &&
    Number.isFinite(p.hardness) &&
    p.hardness >= 0 &&
    p.hardness <= 1 &&
    Number.isFinite(p.opacity) &&
    p.opacity >= 0.01 &&
    p.opacity <= 1;
  if (
    !brush(value) ||
    !Array.isArray(value.strokes) ||
    value.strokes.length > 500 ||
    (value.source !== null && !point(value.source))
  )
    throw new Error('Invalid retouch settings.');
  if (
    value.strokes.reduce(
      (sum, s) => sum + (Array.isArray(s?.points) ? s.points.length : 20001),
      0,
    ) > 20000
  )
    throw new Error('Use up to 20,000 points per retouch layer. Add another layer to continue.');
  for (const stroke of value.strokes)
    if (
      !brush(stroke) ||
      !point(stroke.source) ||
      !Array.isArray(stroke.points) ||
      !stroke.points.length ||
      !stroke.points.every(point)
    )
      throw new Error('Invalid retouch stroke.');
  parsePainting({ ...defaultPainting(), image: value.image });
  return structuredClone(value);
}
