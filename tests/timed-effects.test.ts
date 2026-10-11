import { expect, it } from 'vitest';
import { fadeRange, resizeFade } from '../src/core/timed-effects';
import { sourceTimeAtOutput } from '../src/core/fades';
import { defaultSettings, type MediaAsset } from '../src/core/types';
const edit = {
  ...defaultSettings({ duration: 10, kind: 'video' } as MediaAsset),
  start: 1,
  end: 9,
  cuts: [{ start: 3, end: 5 }],
  speed: 2,
  audioFadeIn: 1.5,
  videoFadeOut: 1.5,
};
it('maps timed fades through trims, gaps, and speed into source lanes', () => {
  expect(sourceTimeAtOutput(edit, 1, 'end')).toBe(3);
  expect(sourceTimeAtOutput(edit, 1, 'start')).toBe(5);
  expect(fadeRange(edit, 'audioFadeIn')).toEqual({ start: 1, end: 6 });
  expect(fadeRange(edit, 'videoFadeOut')).toEqual({ start: 6, end: 9 });
  expect(resizeFade(edit, 'audioFadeIn', { start: 1, end: 7 })).toEqual({ audioFadeIn: 2 });
  expect(resizeFade(edit, 'videoFadeOut', { start: 2, end: 9 })).toEqual({ videoFadeOut: 2.5 });
});
