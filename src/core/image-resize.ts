import type { Geometry } from './geometry';
export interface ImageResize {
  mode: 'original' | 'long-edge' | 'dimensions' | 'percentage';
  width: number;
  height: number;
  percent: number;
  fit: 'contain' | 'cover' | 'stretch';
  withoutEnlargement: boolean;
}
export const defaultImageResize = (): ImageResize => ({
  mode: 'original',
  width: 1600,
  height: 1200,
  percent: 50,
  fit: 'contain',
  withoutEnlargement: true,
});
export function parseImageResize(input: unknown): ImageResize {
  if (input === undefined) return defaultImageResize();
  const r = input as ImageResize;
  if (
    !r ||
    !['original', 'long-edge', 'dimensions', 'percentage'].includes(r.mode) ||
    ![r.width, r.height].every((n) => Number.isInteger(n) && n >= 2 && n <= 8192) ||
    !Number.isFinite(r.percent) ||
    r.percent < 1 ||
    r.percent > 400 ||
    !['contain', 'cover', 'stretch'].includes(r.fit) ||
    typeof r.withoutEnlargement !== 'boolean'
  )
    throw new Error('Choose valid image resize dimensions (2–8,192 px) or a percentage (1–400%).');
  return {
    mode: r.mode,
    width: r.width,
    height: r.height,
    percent: r.percent,
    fit: r.fit,
    withoutEnlargement: r.withoutEnlargement,
  };
}
export function imageResizeGeometry(
  width: number,
  height: number,
  input?: ImageResize,
): Geometry['resize'] {
  const r = parseImageResize(input);
  if (r.mode === 'original') return null;
  let w = r.width,
    h = r.height,
    fit: 'contain' | 'cover' | 'stretch' = 'stretch';
  if (r.mode === 'long-edge' || r.mode === 'percentage') {
    const scale = r.mode === 'long-edge' ? r.width / Math.max(width, height) : r.percent / 100;
    const factor = r.withoutEnlargement ? Math.min(1, scale) : scale;
    w = width * factor;
    h = height * factor;
  } else if (r.fit === 'contain') {
    const factor = Math.min(w / width, h / height, r.withoutEnlargement ? 1 : Infinity);
    w = width * factor;
    h = height * factor;
  } else {
    if (r.withoutEnlargement) {
      const factor = Math.min(1, width / w, height / h);
      w *= factor;
      h *= factor;
    }
    fit = r.fit;
  }
  w = Math.max(2, Math.round(w));
  h = Math.max(2, Math.round(h));
  if (w > 8192 || h > 8192 || w * h > 33554432)
    throw new Error(
      'The resized image exceeds 8,192 pixels or 32 megapixels. Choose a smaller size.',
    );
  return { width: w, height: h, fit };
}
export const imageResizePresets = [
  { name: 'Original size', settings: defaultImageResize() },
  { name: 'Web · 1,600 px', settings: { ...defaultImageResize(), mode: 'long-edge' as const } },
  {
    name: 'Social square · 1,080 × 1,080',
    settings: {
      ...defaultImageResize(),
      mode: 'dimensions' as const,
      width: 1080,
      height: 1080,
      fit: 'cover' as const,
    },
  },
  {
    name: 'Thumbnail · 320 px',
    settings: { ...defaultImageResize(), mode: 'long-edge' as const, width: 320 },
  },
  { name: 'Half size · 50%', settings: { ...defaultImageResize(), mode: 'percentage' as const } },
];
