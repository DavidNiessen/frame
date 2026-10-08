import type { EditSettings, MediaAsset } from './types';
export interface Geometry { rotation: 0 | 90 | 180 | 270; flipHorizontal: boolean; flipVertical: boolean; resize: { width: number; height: number; fit: 'contain' | 'cover' | 'stretch' } | null }
export const defaultGeometry = (): Geometry => ({ rotation: 0, flipHorizontal: false, flipVertical: false, resize: null });
export function parseGeometry(value: unknown): Geometry {
  if (value === undefined) return defaultGeometry(); const g = value as Geometry;
  if (!g || ![0, 90, 180, 270].includes(g.rotation) || typeof g.flipHorizontal !== 'boolean' || typeof g.flipVertical !== 'boolean') throw new Error('Invalid rotation or flip settings.');
  const s = g.resize;
  if (s !== null && (!s || ![s.width, s.height].every(n => Number.isInteger(n) && n >= 2 && n <= 8192) || s.width * s.height > 33_554_432 || !['contain', 'cover', 'stretch'].includes(s.fit))) throw new Error('Resize dimensions must be 2–8,192 pixels, with at most 32 megapixels.');
  return { rotation: g.rotation, flipHorizontal: g.flipHorizontal, flipVertical: g.flipVertical, resize: s ? { ...s } : null };
}
export function frameDimensions(asset: MediaAsset, edit: EditSettings): { width: number; height: number } {
  let width = edit.crop?.width ?? asset.width ?? 640, height = edit.crop?.height ?? asset.height ?? 360;
  if (edit.geometry.rotation % 180) [width, height] = [height, width];
  if (edit.geometry.resize) ({ width, height } = edit.geometry.resize);
  return { width, height };
}
export function geometryFilters(edit: EditSettings): string[] {
  const g = edit.geometry; const filters: string[] = [];
  if (g.rotation === 90) filters.push('transpose=1');
  if (g.rotation === 180) filters.push('hflip', 'vflip');
  if (g.rotation === 270) filters.push('transpose=2');
  if (g.flipHorizontal) filters.push('hflip'); if (g.flipVertical) filters.push('vflip');
  if (g.resize) {
    const { width: w, height: h, fit } = g.resize;
    if (fit === 'stretch') filters.push(`scale=${w}:${h}`);
    else if (fit === 'contain') filters.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease`, `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`);
    else filters.push(`scale=${w}:${h}:force_original_aspect_ratio=increase`, `crop=${w}:${h}`);
    filters.push('setsar=1');
  }
  return filters;
}
/** CSS placement for the uncropped transformed source. Crop editing stays in source coordinates. */
export function geometryPreview(asset: MediaAsset, edit: EditSettings) {
  if (edit.crop) return {};
  const { width: w, height: h } = frameDimensions(asset, edit); const sw = asset.width ?? 640, sh = asset.height ?? 360;
  const rotated = edit.geometry.rotation % 180; const rw = rotated ? sh : sw, rh = rotated ? sw : sh;
  const cover = edit.geometry.resize?.fit === 'cover'; const scale = cover ? Math.max(w / rw, h / rh) : Math.min(w / rw, h / rh);
  const stretch = edit.geometry.resize?.fit === 'stretch';
  return { position: 'absolute' as const, left: '50%', top: '50%', width: `${(stretch ? w / rw : scale) * sw / w * 100}%`, height: `${(stretch ? h / rh : scale) * sh / h * 100}%`, maxWidth: 'none', maxHeight: 'none', objectFit: 'fill' as const, transform: `translate(-50%, -50%) scale(${edit.geometry.flipHorizontal ? -1 : 1}, ${edit.geometry.flipVertical ? -1 : 1}) rotate(${edit.geometry.rotation}deg)` };
}
