import type { EditSettings, MediaAsset } from './types';
export function videoFilters(_asset: MediaAsset, edit: EditSettings): string[] {
  const c = edit.crop; return c ? [`crop=${c.width}:${c.height}:${c.x}:${c.y}`] : [];
}
export function audioFilters(edit: EditSettings): string[] { return [`volume=${edit.volume}`]; }
