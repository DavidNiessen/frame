import { expect, it } from 'vitest';
import { defaultSettings, type MediaAsset } from '../src/core/types';
import { parseTimecode, preciseTimecode, skipSeconds, stepFrame } from '../src/core/playhead';
const asset: MediaAsset = { id: 'test', name: 'video.mp4', kind: 'video', duration: 10, size: 1, previewUrl: '', hasAudio: true };
it('steps through frames in sequence order, across gaps and changed speeds', () => {
  const edit = { ...defaultSettings(asset), clips: [{ id: 'late', start: 6, end: 7, effects: { speed: 2 } }, { id: 'early', start: 1, end: 2, effects: {} }] };
  expect(stepFrame(edit, 6, 25, 1)).toBeCloseTo(6.04);
  expect(stepFrame(defaultSettings(asset), .041666, 24, 1)).toBeCloseTo(2 / 24);
  expect(stepFrame(edit, 6, 25, -1)).toBe(6);
  expect(stepFrame(edit, 6.96, 25, 1)).toBe(1);
  expect(stepFrame(edit, 1, 25, -1)).toBeCloseTo(6.96);
  expect(stepFrame(edit, 1.96, 25, 1)).toBeCloseTo(1.96);
  expect(stepFrame(edit, 2, 25, 1)).toBeCloseTo(1.96);
  expect(skipSeconds(edit, 6, .6)).toBeCloseTo(1.1);
  expect(stepFrame({ ...defaultSettings(asset), cuts: [{ start: 1, end: 3 }] }, .96, 25, 1)).toBe(3);
});
it('parses precise positions and carries rounded timecode values across minutes', () => {
  expect(parseTimecode('1:02:03.456', 4000)).toBeCloseTo(3723.456);
  expect(parseTimecode('62.25', 100)).toBe(62.25);
  expect(preciseTimecode(59.9998)).toBe('1:00.000'); expect(preciseTimecode(3600)).toBe('1:00:00.000');
  for (const value of ['-1', '1:60', '1:60:00', '0:12:60.1', 'Infinity', 'abc', '5000']) expect(() => parseTimecode(value, 4000)).toThrow();
});
