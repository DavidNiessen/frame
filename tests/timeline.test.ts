import { expect, it } from 'vitest';
import { keptRanges, editedDuration, timelineSections, nextPlayableTime } from '../src/core/timeline';
import { defaultSettings, type MediaAsset } from '../src/core/types';
const asset = { duration: 10, kind: 'video' } as MediaAsset;
it('merges overlapping removals and trims their bounds', () => {
  const edit = { ...defaultSettings(asset), start: 1, end: 9, cuts: [{ start: 0, end: 2 }, { start: 4, end: 6 }, { start: 5, end: 7 }] };
  expect(keptRanges(edit)).toEqual([{ start: 2, end: 4 }, { start: 7, end: 9 }]);
  expect(editedDuration(edit)).toBe(4);
  expect(nextPlayableTime(edit, 5)).toBe(7);
  expect(nextPlayableTime(edit, 10)).toBeNull();
});
it('exposes split sections without changing exported duration', () => {
  const edit = { ...defaultSettings(asset), splits: [3, 7] };
  expect(timelineSections(edit)).toEqual([{ start: 0, end: 3 }, { start: 3, end: 7 }, { start: 7, end: 10 }]);
  expect(editedDuration(edit)).toBe(10);
});
