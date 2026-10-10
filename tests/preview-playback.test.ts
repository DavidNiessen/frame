import { expect, it } from 'vitest';
import { previewPlaybackStep } from '../src/core/preview-playback';
import { nextPlayableTime } from '../src/core/timeline';
import { defaultSettings, type MediaAsset } from '../src/core/types';

const edit = { ...defaultSettings({ duration: 6, kind: 'video' } as MediaAsset), clips: [
  { id: 'a', start: 0, end: 2, effects: {} },
  { id: 'b', start: 2, end: 4, effects: {} },
  { id: 'c', start: 4, end: 6, effects: {} },
] };

it('keeps the source clock unchanged across contiguous splits, including frame overshoot', () => {
  expect(previewPlaybackStep(edit, 1.99, 'a')).toEqual({ time: 1.99, clipId: 'a' });
  expect(previewPlaybackStep(edit, 2.03, 'a')).toEqual({ time: 2.03, clipId: 'b' });
  expect(previewPlaybackStep(edit, 4.02, 'a')).toEqual({ time: 4.02, clipId: 'c' });
  expect(previewPlaybackStep(edit, 3, null)).toEqual({ time: 3, clipId: 'b' });
  expect(nextPlayableTime(edit, 1.99)).toBe(1.99);
});

it('seeks across trimmed gaps and reordered clips and stops at the final boundary', () => {
  const gap = { ...edit, clips: [edit.clips[0], { ...edit.clips[1], start: 3 }] };
  expect(previewPlaybackStep(gap, 1.99, 'a')).toEqual({ time: 3, clipId: 'b' });
  const reordered = { ...edit, clips: [edit.clips[2], edit.clips[0]] };
  expect(previewPlaybackStep(reordered, 5.99, 'c')).toEqual({ time: 0, clipId: 'a' });
  expect(previewPlaybackStep(edit, 5.99, 'c')).toEqual({ time: null, clipId: null });
});

it('continues to skip removed regions in legacy recipes', () => {
  expect(previewPlaybackStep({ ...edit, clips: undefined, cuts: [{ start: 2, end: 4 }] }, 2.1, null)).toEqual({ time: 4, clipId: null });
});
