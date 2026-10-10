import { expect, it } from 'vitest';
import { resizeSection } from '../src/core/timeline-edit';
import { editedDuration, timelineSections } from '../src/core/timeline';
import { defaultSettings, type MediaAsset } from '../src/core/types';
import { editClips, splitClip } from '../src/core/clips';
import { parseEdit } from '../src/core/project';
import { hasMinimumDuration } from '../src/core/time-range';
const initial = defaultSettings({ duration: 10, kind: 'video' } as MediaAsset);
it('trims and restores either edge of a source clip', () => {
  let edit = { ...initial, ...resizeSection(initial, 0, { start: 2, end: 10 }, 10) };
  edit = { ...edit, ...resizeSection(edit, 0, { start: 2, end: 8 }, 10) };
  expect(timelineSections(edit)).toEqual([{ start: 2, end: 8 }]);
  expect(editedDuration(edit)).toBe(6);
  edit = { ...edit, ...resizeSection(edit, 0, { start: 0, end: 8 }, 10) };
  edit = { ...edit, ...resizeSection(edit, 0, { start: 0, end: 10 }, 10) };
  expect(timelineSections(edit)).toEqual([{ start: 0, end: 10 }]);
});
it('shortens split sections independently and expands into a gap without moving neighbours', () => {
  let edit = { ...initial, splits: [3, 7] };
  edit = { ...edit, ...resizeSection(edit, 1, { start: 4, end: 6 }, 10) };
  expect(timelineSections(edit)).toEqual([{ start: 0, end: 3 }, { start: 4, end: 6 }, { start: 7, end: 10 }]);
  expect(editedDuration(edit)).toBe(8);
  edit = { ...edit, ...resizeSection(edit, 1, { start: 3, end: 7 }, 10) };
  expect(timelineSections(edit)).toEqual([{ start: 0, end: 3 }, { start: 3, end: 7 }, { start: 7, end: 10 }]);
  expect(editedDuration(edit)).toBe(10);
});
it('prevents crossing neighbours, disappearing clips, and non-finite edits', () => {
  const edit = { ...initial, splits: [3, 7] };
  const bounded = { ...edit, ...resizeSection(edit, 1, { start: -4, end: 20 }, 10) };
  expect(timelineSections(bounded)).toEqual(timelineSections(edit));
  const tiny = { ...edit, ...resizeSection(edit, 1, { start: 9, end: 7 }, 10) };
  expect(timelineSections(tiny)[1].end - timelineSections(tiny)[1].start).toBeCloseTo(0.05);
  expect(resizeSection(edit, 1, { start: NaN, end: 7 }, 10)).toEqual({});
});
it('keeps minimum-length decimal clips valid and restores either outer edge after splitting', () => {
  const asset = { duration: 10, kind: 'video', width: 640, height: 360, hasAudio: true } as MediaAsset;
  let edit = { ...defaultSettings(asset), start: 2.4, end: 2.5 };
  edit = { ...edit, ...splitClip(edit, editClips(edit)[0].id, 2.45) };
  expect(edit.clips).toHaveLength(2);
  expect(hasMinimumDuration(edit.clips![1])).toBe(true);
  expect(() => parseEdit(edit, asset)).not.toThrow();
  edit = { ...edit, ...resizeSection(edit, 0, { start: 1, end: 2.45 }, 10) };
  edit = { ...edit, ...resizeSection(edit, 1, { start: 2.45, end: 4 }, 10) };
  expect(edit.clips!.map(({ start, end }) => ({ start, end }))).toEqual([{ start: 1, end: 2.45 }, { start: 2.45, end: 4 }]);
  expect(() => parseEdit({ ...edit, start: 1, end: 4 }, asset)).not.toThrow();
  expect(hasMinimumDuration({ start: 2.45, end: 2.4999 })).toBe(false);
});
it('limits high-speed trimming to a valid output duration and keeps reordered neighbours separate', () => {
  const edit = { ...initial, clips: [{ id: 'late', start: 7, end: 10, effects: { speed: 4 } }, { id: 'early', start: 0, end: 3, effects: {} }] };
  const trimmed = { ...edit, ...resizeSection(edit, 0, { start: 7, end: 7.01 }, 10) };
  expect(trimmed.clips![0].end).toBeCloseTo(7.2);
  expect(trimmed.clips![1]).toEqual(edit.clips[1]);
  expect(splitClip(trimmed, 'late', 7.1)).toEqual({});
});
