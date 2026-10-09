import { expect, it } from 'vitest';
import { addMarker, markerInSequence, orderedMarkers, parseMarkers } from '../src/core/markers';
import { createProject, parseEdit, parseProject } from '../src/core/project';
import { defaultSettings, type MediaAsset } from '../src/core/types';
const asset: MediaAsset = { id: 'a', name: 'clip.mp4', duration: 8, kind: 'video', width: 640, height: 480, hasAudio: true, size: 1, previewUrl: '' };
it('preserves source anchors through clip reordering, trims and project round trips', () => {
  const edit = defaultSettings(asset); edit.markers = addMarker(edit, 1); edit.markers = addMarker(edit, 5);
  const reordered = { ...edit, clips: [{ id: 'late', start: 4, end: 8, effects: {} }, { id: 'early', start: 0, end: 3, effects: {} }] };
  expect(orderedMarkers(reordered).map(marker => marker.time)).toEqual([5, 1]);
  expect(markerInSequence({ ...edit, start: 2 }, edit.markers[0])).toBe(false);
  const restored = parseProject(createProject('Marked', [asset], () => reordered, asset.id));
  expect(restored.sources[0].edit.markers).toEqual(edit.markers);
  expect(addMarker(edit, 5)).toBe(edit.markers);
  expect(parseEdit({ ...edit, markers: undefined }, asset).markers).toEqual([]);
});
it('rejects malformed and duplicated markers in saved or imported settings', () => {
  const marker = { id: 'm', time: 1, name: 'Scene', color: 'violet' };
  for (const invalid of [[marker, marker], [{ ...marker, time: NaN }], [{ ...marker, time: 9 }], [{ ...marker, color: 'url(bad)' }], [{ ...marker, name: '' }], Array(501).fill(marker)]) expect(() => parseMarkers(invalid, 8)).toThrow();
});
