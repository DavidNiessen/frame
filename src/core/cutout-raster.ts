import type { CutoutSettings } from './cutout';
function soften(input: Uint8ClampedArray, width: number, height: number, radius: number) {
  let result = input;
  for (let pass = 0; pass < 3; pass++) {
    const horizontal = new Uint8ClampedArray(input.length),
      vertical = new Uint8ClampedArray(input.length),
      window = radius * 2 + 1;
    for (let y = 0; y < height; y++) {
      let sum = 0;
      for (let x = -radius; x <= radius; x++)
        sum += result[y * width + Math.max(0, Math.min(width - 1, x))];
      for (let x = 0; x < width; x++) {
        horizontal[y * width + x] = sum / window;
        sum +=
          result[y * width + Math.min(width - 1, x + radius + 1)] -
          result[y * width + Math.max(0, x - radius)];
      }
    }
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let y = -radius; y <= radius; y++)
        sum += horizontal[Math.max(0, Math.min(height - 1, y)) * width + x];
      for (let y = 0; y < height; y++) {
        vertical[y * width + x] = sum / window;
        sum +=
          horizontal[Math.min(height - 1, y + radius + 1) * width + x] -
          horizontal[Math.max(0, y - radius) * width + x];
      }
    }
    result = vertical;
  }
  return result;
}
/** Edge-connected color removal. Useful for plain/gradient backgrounds; does not use an AI model. */
export function cutoutPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  settings: CutoutSettings,
) {
  const count = width * height,
    mask = new Uint8ClampedArray(count).fill(255),
    visited = new Uint8Array(count),
    queue = new Uint32Array(count),
    palette: number[][] = [];
  if (settings.background === 'sample' && settings.sample) {
    const at =
      (Math.min(height - 1, Math.round(settings.sample.y * (height - 1))) * width +
        Math.min(width - 1, Math.round(settings.sample.x * (width - 1)))) *
      4;
    palette.push(Array.from(pixels.subarray(at, at + 3)));
  } else {
    const bins = new Map<string, { count: number; color: number[] }>();
    const add = (at: number) => {
      at *= 4;
      if (pixels[at + 3] < 16) return;
      const key = [pixels[at] >> 4, pixels[at + 1] >> 4, pixels[at + 2] >> 4].join(','),
        item = bins.get(key);
      if (item) item.count++;
      else bins.set(key, { count: 1, color: Array.from(pixels.subarray(at, at + 3)) });
    };
    for (let x = 0; x < width; x++) {
      add(x);
      add((height - 1) * width + x);
    }
    for (let y = 1; y < height - 1; y++) {
      add(y * width);
      add(y * width + width - 1);
    }
    palette.push(
      ...[...bins.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map((b) => b.color),
    );
  }
  const threshold = settings.tolerance * Math.sqrt(3) * 255,
    match = (at: number) =>
      pixels[at * 4 + 3] < 16 ||
      palette.some(
        (color) =>
          Math.hypot(
            pixels[at * 4] - color[0],
            pixels[at * 4 + 1] - color[1],
            pixels[at * 4 + 2] - color[2],
          ) <= threshold,
      );
  let read = 0,
    write = 0;
  const visit = (at: number) => {
    if (visited[at]) return;
    visited[at] = 1;
    if (match(at)) {
      mask[at] = 0;
      queue[write++] = at;
    }
  };
  if (settings.contiguous) {
    for (let x = 0; x < width; x++) {
      visit(x);
      visit((height - 1) * width + x);
    }
    for (let y = 1; y < height - 1; y++) {
      visit(y * width);
      visit(y * width + width - 1);
    }
    while (read < write) {
      const at = queue[read++],
        x = at % width,
        y = Math.floor(at / width);
      if (x > 0) visit(at - 1);
      if (x < width - 1) visit(at + 1);
      if (y > 0) visit(at - width);
      if (y < height - 1) visit(at + width);
    }
  } else for (let at = 0; at < count; at++) if (match(at)) mask[at] = 0;
  const result =
    settings.feather > 0
      ? soften(
          mask,
          width,
          height,
          Math.max(1, Math.min(128, Math.round(settings.feather * width))),
        )
      : mask;
  // Brush refinement follows automatic removal, so restored regions survive tolerance changes.
  for (const stroke of settings.strokes) {
    const radius = Math.max(0.5, (stroke.size * width) / 2),
      target = stroke.color.toLowerCase() === '#ffffff' ? 255 : 0;
    const stamp = (x: number, y: number) => {
      for (
        let py = Math.max(0, Math.floor(y - radius));
        py <= Math.min(height - 1, Math.ceil(y + radius));
        py++
      )
        for (
          let px = Math.max(0, Math.floor(x - radius));
          px <= Math.min(width - 1, Math.ceil(x + radius));
          px++
        ) {
          const distance = Math.hypot(px - x, py - y) / radius;
          if (distance > 1) continue;
          const weight = stroke.opacity * Math.min(1, (1 - distance) * 4),
            at = py * width + px;
          result[at] = result[at] * (1 - weight) + target * weight;
        }
    };
    const first = stroke.points[0];
    stamp(first.x * width, first.y * height);
    for (let i = 1; i < stroke.points.length; i++) {
      const a = stroke.points[i - 1],
        b = stroke.points[i],
        steps = Math.max(
          1,
          Math.ceil(
            Math.hypot((b.x - a.x) * width, (b.y - a.y) * height) / Math.max(1, radius / 3),
          ),
        );
      for (let k = 1; k <= steps; k++)
        stamp(
          (a.x + ((b.x - a.x) * k) / steps) * width,
          (a.y + ((b.y - a.y) * k) / steps) * height,
        );
    }
  }
  const rgba = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) {
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = result[i];
  }
  return rgba;
}
