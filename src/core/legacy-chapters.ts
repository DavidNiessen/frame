/** Legacy saved markers are read only, retained solely for existing chapter exports. */
import { editClips } from './clips';
import { outputTimeAtSource } from './fades';
import type { EditSettings } from './types';
export const legacyChapterColors = ['violet', 'blue', 'amber', 'rose', 'mint'] as const;
export interface LegacyChapterPoint {
  id: string;
  name: string;
  time: number;
  color: (typeof legacyChapterColors)[number];
}
export function parseLegacyChapterPoints(value: unknown, duration: number): LegacyChapterPoint[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 500)
    throw new Error('A timeline can contain up to 500 markers.');
  const ids = new Set<string>();
  return value.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid timeline marker.');
    const marker = raw as LegacyChapterPoint;
    if (
      typeof marker.id !== 'string' ||
      !marker.id ||
      marker.id.length > 120 ||
      ids.has(marker.id) ||
      typeof marker.name !== 'string' ||
      !marker.name.trim() ||
      marker.name.length > 80 ||
      !Number.isFinite(marker.time) ||
      marker.time < 0 ||
      marker.time > duration ||
      !legacyChapterColors.includes(marker.color)
    )
      throw new Error('Invalid timeline marker.');
    ids.add(marker.id);
    return { id: marker.id, name: marker.name.trim(), time: marker.time, color: marker.color };
  });
}
export function legacyChapterInSequence(edit: EditSettings, marker: LegacyChapterPoint): boolean {
  return editClips(edit).some((clip) => marker.time >= clip.start && marker.time < clip.end);
}
export function orderedLegacyChapterPoints(edit: EditSettings): LegacyChapterPoint[] {
  return [...(edit.markers ?? [])]
    .filter((marker) => legacyChapterInSequence(edit, marker))
    .sort((a, b) => outputTimeAtSource(edit, a.time) - outputTimeAtSource(edit, b.time));
}
