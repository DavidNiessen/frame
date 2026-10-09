import { editClips } from './clips';
import { outputTimeAtSource } from './fades';
import type { EditSettings } from './types';
export const markerColors = ['violet', 'blue', 'amber', 'rose', 'mint'] as const;
export interface TimelineMarker { id: string; name: string; time: number; color: typeof markerColors[number] }
export function parseMarkers(value: unknown, duration: number): TimelineMarker[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 500) throw new Error('A timeline can contain up to 500 markers.');
  const ids = new Set<string>();
  return value.map(raw => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid timeline marker.');
    const marker = raw as TimelineMarker;
    if (typeof marker.id !== 'string' || !marker.id || marker.id.length > 120 || ids.has(marker.id) || typeof marker.name !== 'string' || !marker.name.trim() || marker.name.length > 80 || !Number.isFinite(marker.time) || marker.time < 0 || marker.time > duration || !markerColors.includes(marker.color)) throw new Error('Invalid timeline marker.');
    ids.add(marker.id);
    return { id: marker.id, name: marker.name.trim(), time: marker.time, color: marker.color };
  });
}
export function markerInSequence(edit: EditSettings, marker: TimelineMarker): boolean {
  return editClips(edit).some(clip => marker.time >= clip.start && marker.time < clip.end);
}
export function orderedMarkers(edit: EditSettings): TimelineMarker[] {
  return [...(edit.markers ?? [])].filter(marker => markerInSequence(edit, marker)).sort((a, b) => outputTimeAtSource(edit, a.time) - outputTimeAtSource(edit, b.time));
}
export function addMarker(edit: EditSettings, time: number): TimelineMarker[] {
  const markers = edit.markers ?? [];
  if (markers.length >= 500) throw new Error('A timeline can contain up to 500 markers.');
  const existing = markers.find(marker => Math.abs(marker.time - time) < .002);
  return existing ? markers : [...markers, { id: crypto.randomUUID(), name: `Marker ${markers.length + 1}`, time, color: 'violet' }];
}
