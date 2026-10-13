import type { RetouchStroke } from './retouch';
/** Soft clone stamps and local color-matching healing; source pixels never include this layer. */
export function retouchPixels(
  base: Uint8ClampedArray,
  width: number,
  height: number,
  strokes: RetouchStroke[],
) {
  const layer = new Uint8ClampedArray(base.length);
  const mean = (x: number, y: number, radius: number) => {
    const channels = [0, 0, 0];
    let n = 0;
    for (let i = 0; i < 24; i++) {
      const angle = (i * Math.PI) / 12,
        px = Math.round(x + Math.cos(angle) * radius * 0.9),
        py = Math.round(y + Math.sin(angle) * radius * 0.9);
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const at = (py * width + px) * 4;
      if (!base[at + 3]) continue;
      for (let c = 0; c < 3; c++) channels[c] += base[at + c];
      n++;
    }
    return channels.map((v) => (n ? v / n : 0));
  };
  for (const stroke of strokes) {
    const first = stroke.points[0],
      dx = (stroke.source.x - first.x) * width,
      dy = (stroke.source.y - first.y) * height,
      radius = Math.max(0.5, (stroke.size * width) / 2);
    const stamp = (x: number, y: number) => {
      const target = stroke.mode === 'heal' ? mean(x, y, radius) : [0, 0, 0],
        source = stroke.mode === 'heal' ? mean(x + dx, y + dy, radius) : [0, 0, 0];
      const minX = Math.max(0, Math.floor(x - radius)),
        maxX = Math.min(width - 1, Math.ceil(x + radius)),
        minY = Math.max(0, Math.floor(y - radius)),
        maxY = Math.min(height - 1, Math.ceil(y + radius));
      for (let py = minY; py <= maxY; py++)
        for (let px = minX; px <= maxX; px++) {
          const distance = Math.hypot(px - x, py - y) / radius;
          if (distance > 1) continue;
          const weight =
              stroke.opacity *
              (distance <= stroke.hardness
                ? 1
                : (1 - distance) / Math.max(0.001, 1 - stroke.hardness)),
            at = (py * width + px) * 4;
          if (stroke.mode === 'erase') {
            layer[at + 3] *= 1 - weight;
            continue;
          }
          const sx = Math.round(px + dx),
            sy = Math.round(py + dy);
          if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
          const from = (sy * width + sx) * 4,
            alpha = (weight * base[from + 3]) / 255,
            old = layer[at + 3] / 255,
            combined = alpha + old * (1 - alpha);
          if (!combined) continue;
          for (let c = 0; c < 3; c++) {
            const color = Math.max(0, Math.min(255, base[from + c] + target[c] - source[c]));
            layer[at + c] = (color * alpha + layer[at + c] * old * (1 - alpha)) / combined;
          }
          layer[at + 3] = combined * 255;
        }
    };
    stamp(first.x * width, first.y * height);
    for (let i = 1; i < stroke.points.length; i++) {
      const a = stroke.points[i - 1],
        b = stroke.points[i],
        distance = Math.hypot((b.x - a.x) * width, (b.y - a.y) * height),
        steps = Math.max(1, Math.ceil(distance / Math.max(1, radius / 3)));
      for (let k = 1; k <= steps; k++)
        stamp(
          (a.x + ((b.x - a.x) * k) / steps) * width,
          (a.y + ((b.y - a.y) * k) / steps) * height,
        );
    }
  }
  return layer;
}
