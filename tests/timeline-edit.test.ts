import { expect, it } from 'vitest';
import { resizeSection } from '../src/core/timeline-edit';
import { editedDuration, timelineSections } from '../src/core/timeline';
import { defaultSettings, type MediaAsset } from '../src/core/types';
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
