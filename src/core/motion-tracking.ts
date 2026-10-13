import { keyframeValue, type MediaAnimation } from './keyframes';
import type { MediaLayer } from './media-layers';
export interface TrackingRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface MotionPoint {
  time: number;
  x: number;
  y: number;
  confidence: number;
}
export interface MotionResult {
  points: MotionPoint[];
  lostAt?: number;
}
/** Fixed-template normalized correlation avoids accumulating drift between frames. */
export function trackMotion(
  bytes: Uint8Array,
  width: number,
  height: number,
  fps: number,
  region: TrackingRegion,
  progress = (ratio: number) => {
    void ratio;
  },
): MotionResult {
  const frameSize = width * height,
    count = Math.floor(bytes.length / frameSize),
    rw = Math.round(region.width),
    rh = Math.round(region.height);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 2 ||
    height < 2 ||
    width > 320 ||
    height > 240 ||
    !count ||
    count > 241 ||
    !Number.isFinite(fps) ||
    fps <= 0 ||
    rw < 8 ||
    rh < 8 ||
    region.x < 0 ||
    region.y < 0 ||
    region.x + rw > width ||
    region.y + rh > height
  )
    throw new Error(
      'Select a textured subject at least 8 pixels wide and high inside the tracking frame.',
    );
  const offsets: { x: number; y: number }[] = [];
  for (let y = 0; y < rh; y += Math.max(1, Math.ceil(rh / 24)))
    for (let x = 0; x < rw; x += Math.max(1, Math.ceil(rw / 24))) offsets.push({ x, y });
  const initialX = Math.round(region.x),
    initialY = Math.round(region.y),
    values = offsets.map((p) => bytes[(initialY + p.y) * width + initialX + p.x]),
    mean = values.reduce((s, v) => s + v, 0) / values.length;
  const template = values.map((v) => v - mean),
    energy = template.reduce((s, v) => s + v * v, 0);
  if (Math.sqrt(energy / values.length) < 6)
    throw new Error(
      'This area is too uniform to track. Include a contrasting edge or textured detail.',
    );
  let x = initialX,
    y = initialY;
  const points: MotionPoint[] = [{ time: 0, x: x + rw / 2, y: y + rh / 2, confidence: 1 }];
  const score = (frame: number, px: number, py: number) => {
    let sum = 0,
      square = 0,
      cross = 0;
    for (let i = 0; i < offsets.length; i++) {
      const p = offsets[i],
        v = bytes[frame * frameSize + (py + p.y) * width + px + p.x];
      sum += v;
      square += v * v;
      cross += v * template[i];
    }
    const variance = square - (sum * sum) / offsets.length;
    return variance < 1 ? -1 : cross / Math.sqrt(energy * variance);
  };
  for (let frame = 1; frame < count; frame++) {
    const radius = 24,
      minX = Math.max(0, x - radius),
      maxX = Math.min(width - rw, x + radius),
      minY = Math.max(0, y - radius),
      maxY = Math.min(height - rh, y + radius);
    let bx = x,
      by = y,
      best = -1;
    for (let py = minY; py <= maxY; py += 2)
      for (let px = minX; px <= maxX; px += 2) {
        const value = score(frame, px, py);
        if (value > best) {
          best = value;
          bx = px;
          by = py;
        }
      }
    const coarseX = bx,
      coarseY = by;
    for (let py = Math.max(minY, coarseY - 2); py <= Math.min(maxY, coarseY + 2); py++)
      for (let px = Math.max(minX, coarseX - 2); px <= Math.min(maxX, coarseX + 2); px++) {
        const value = score(frame, px, py);
        if (value > best) {
          best = value;
          bx = px;
          by = py;
        }
      }
    if (best < 0.6) return { points, lostAt: frame / fps };
    x = bx;
    y = by;
    points.push({ time: frame / fps, x: x + rw / 2, y: y + rh / 2, confidence: best });
    progress(frame / (count - 1));
  }
  return { points };
}
/** Reduce linear paths without removing corners or reversals. Coordinates are tracking pixels. */
export function simplifyMotion(points: MotionPoint[], tolerance = 0.4): MotionPoint[] {
  if (points.length < 3) return points;
  const first = points[0],
    last = points.at(-1)!;
  let greatest = 0,
    at = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const q = (points[i].time - first.time) / (last.time - first.time),
      distance = Math.hypot(
        points[i].x - first.x - (last.x - first.x) * q,
        points[i].y - first.y - (last.y - first.y) * q,
      );
    if (distance > greatest) {
      greatest = distance;
      at = i;
    }
  }
  return greatest > tolerance
    ? [
        ...simplifyMotion(points.slice(0, at + 1), tolerance).slice(0, -1),
        ...simplifyMotion(points.slice(at), tolerance),
      ]
    : [first, last];
}
export function trackedAnimation(
  layer: MediaLayer,
  result: MotionResult,
  start: number,
  width: number,
  height: number,
): MediaAnimation {
  if (result.points.length < 2)
    throw new Error('The subject was lost before motion could be tracked. Try a different region.');
  const points = simplifyMotion(result.points),
    first = points[0],
    local = start - layer.start;
  return {
    ...layer.animation,
    ...Object.fromEntries(
      (['x', 'y'] as const).map((property) => [
        property,
        {
          interpolation: 'linear',
          keys: points.map((p) => ({
            time: Number((local + p.time).toFixed(6)),
            value: Math.max(
              -100,
              Math.min(
                200,
                keyframeValue(layer.animation?.[property], local, layer[property]) +
                  ((p[property] - first[property]) * 100) / (property === 'x' ? width : height),
              ),
            ),
          })),
        },
      ]),
    ),
  };
}
