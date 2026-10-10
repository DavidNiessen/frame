import { expect, it } from 'vitest';
import { snapTargets, snapTime } from '../src/core/snapping';
import { defaultSettings, type MediaAsset } from '../src/core/types';
const asset: MediaAsset = { id: 'a', name: 'a.mp4', duration: 10, hasAudio: true, kind: 'video', size: 1, previewUrl: '' };
it('prioritizes nearby landmarks over frames and does not snap outside tolerance', () => {
  expect(snapTime(1.031, [1.03], .02, 24)).toBe(1.03);
  expect(snapTime(1.031, [], .02, 24)).toBeCloseTo(25 / 24);
  expect(snapTime(1.031, [2], .001, 24)).toBe(1.031);
  expect(snapTime(1, [NaN, 2], .1)).toBe(1);
});
it('maps source landmarks onto reordered output and keeps playhead optional for scrubbing', () => {
  const edit = { ...defaultSettings(asset), markers: [{ id: 'm', name: 'Moment', time: 5, color: 'violet' as const }], clips: [{ id: 'late', start: 4, end: 8, effects: { speed: 2 } }, { id: 'early', start: 0, end: 2, effects: {} }] };
  expect(snapTargets(edit, asset.duration, 1.3).source).toContain(1.3);
  expect(snapTargets(edit, asset.duration).source).not.toContain(1.3);
  expect(snapTargets(edit, asset.duration).source).not.toContain(5);
  expect(snapTargets(edit, asset.duration).output).toEqual(expect.arrayContaining([0, 2, 4]));
});
