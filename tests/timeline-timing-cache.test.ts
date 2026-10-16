import { expect, it } from 'vitest';
import { clipPositions } from '../src/core/clips';
import { editedDuration } from '../src/core/timeline';
import { defaultSettings, type MediaAsset } from '../src/core/types';
const edit = () => ({
  ...defaultSettings({ kind: 'video', duration: 1000 } as MediaAsset),
  clips: Array.from({ length: 1000 }, (_, i) => ({
    id: String(i),
    start: i,
    end: i + 1,
    effects: {},
  })),
});
it('reuses immutable sequence timing at playback rate and recalculates after an edit', () => {
  const original = Object.freeze(edit()),
    positions = clipPositions(original);
  expect(editedDuration(original)).toBe(1000);
  for (let i = 0; i < 120; i++) expect(clipPositions(original)).toBe(positions);
  const changed = Object.freeze({ ...original, speed: 2 });
  expect(clipPositions(changed)).not.toBe(positions);
  expect(clipPositions(changed).at(-1)!.end).toBe(500);
  expect(editedDuration(changed)).toBe(500);
});
it('never caches mutable drafts while imports and edits are being assembled', () => {
  const draft = edit();
  expect(editedDuration(draft)).toBe(1000);
  expect(clipPositions(draft).at(-1)!.end).toBe(1000);
  Object.assign(draft.clips[0].effects, { speed: 2 });
  expect(editedDuration(draft)).toBe(999.5);
  expect(clipPositions(draft).at(-1)!.end).toBe(999.5);
});
