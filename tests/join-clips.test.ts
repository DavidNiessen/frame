import { expect, it } from 'vitest';
import { editClips, splitClip, reorderClip } from '../src/core/clips';
import { adjacentSplitJoin, joinSplitClips } from '../src/core/join-clips';
import { addTimelineEffect } from '../src/core/timeline-effects';
import { clipGroups, resizeClipGroup } from '../src/core/clip-groups';
import { sourceTimeAtOutput } from '../src/core/fades';
import { editedDuration } from '../src/core/timeline';
import { parseEdit } from '../src/core/project';
import { defaultSettings, type EditSettings, type MediaAsset } from '../src/core/types';
const asset = { duration: 6, width: 640, height: 360, kind: 'video', hasAudio: true } as MediaAsset;
function split() { const edit = defaultSettings(asset); return { ...edit, ...splitClip(edit, editClips(edit)[0].id, 3) }; }
it('joins either selected neighbour without changing track effects, duration or saved settings', () => {
  const base = split(), edit = { ...base, ...addTimelineEffect(base, asset, 'audioFadeOut', 0) }, before = JSON.stringify(edit);
  for (const clip of edit.clips!) {
    const joined = { ...edit, ...joinSplitClips(edit, clip.id) };
    expect(joined.clips).toEqual([{ ...edit.clips![0], end: 6 }]);
    expect(joined.effectInstances).toBe(edit.effectInstances); expect(editedDuration(joined)).toBe(6);
    expect(parseEdit(JSON.parse(JSON.stringify(joined)), asset).effectInstances).toEqual(edit.effectInstances);
  }
  expect(JSON.stringify(edit)).toBe(before);
});
it('rejects reversed clips and different legacy adjustments', () => {
  const edit = split(), [left, right] = edit.clips!;
  for (const clips of [[right, left], [left, { ...right, effects: { volume: .5 } }]]) {
    const changed = { ...edit, clips }; expect(adjacentSplitJoin(changed, clips[0].id)).toBeNull(); expect(joinSplitClips(changed, clips[0].id)).toEqual({});
  }
  expect(joinSplitClips(edit, 'missing')).toEqual({});
});
it('preserves matching legacy settings but refuses treatments tied to individual clip boundaries', () => {
  const edit = split();
  const same = { ...edit, clips: edit.clips!.map(clip => ({ ...clip, effects: { volume: .5, speed: 2 } })) };
  expect(joinSplitClips(same, same.clips[0].id).clips).toHaveLength(1);
  for (const effects of [{ audioFadeOut: .3 }, { normalizeLoudness: true }]) {
    const local = { ...edit, clips: edit.clips!.map(clip => ({ ...clip, effects })) };
    expect(adjacentSplitJoin(local, local.clips[0].id)).toBeNull();
  }
});

it('joins retained pieces across deleted footage without restoring it or moving effects', () => {
  const base = split(), retained = { ...base, clips: [base.clips![0], { ...base.clips![1], start: 4 }] };
  const edit = { ...retained, ...addTimelineEffect(retained, asset, 'videoFadeOut', 0) }, snapshot = JSON.stringify(edit);
  const joined = { ...edit, ...joinSplitClips(edit, edit.clips![1].id) };
  expect(joined.clips!.map(({ start, end }) => [start, end])).toEqual([[0, 3], [4, 6]]);
  expect(clipGroups(joined)).toHaveLength(1); expect(editedDuration(joined)).toBe(5);
  expect(sourceTimeAtOutput(joined, 3.5)).toBe(4.5);
  expect(joined.effectInstances).toBe(edit.effectInstances);
  const saved = parseEdit(JSON.parse(JSON.stringify(joined)), asset);
  expect(clipGroups(saved)).toHaveLength(1); expect(JSON.stringify(edit)).toBe(snapshot);
  expect(clipGroups({ ...joined, ...splitClip(joined, joined.clips![1].id, 4) })).toHaveLength(2);
  const trimmed = { ...joined, ...resizeClipGroup(joined, joined.clips!, { start: .5, end: 4.5 }, 6) };
  expect(trimmed.clips!.map(({ start, end }) => [start, end])).toEqual([[.5, 3], [4, 5.5]]);
});
it('splits and moves a joined bar as a unit while retaining its internal cuts', () => {
  const edit: EditSettings = { ...defaultSettings(asset), clips: [{ id: 'a', start: 0, end: 1, effects: {} }, { id: 'b', start: 2, end: 4, effects: {} }, { id: 'c', start: 4, end: 6, effects: {} }] };
  const joined = { ...edit, ...joinSplitClips(edit, 'a') };
  expect(clipGroups(joined)).toHaveLength(2);
  const moved = { ...joined, ...reorderClip(joined, 'a', 2) };
  expect(moved.clips!.map(clip => clip.id)).toEqual(['c', 'a', 'b']); expect(clipGroups(moved)).toHaveLength(2);
  const divided = { ...joined, ...splitClip(joined, 'b', 3) };
  expect(clipGroups(divided).map(group => group.clips.map(clip => [clip.start, clip.end]))).toEqual([[[0, 1], [2, 3]], [[3, 4]], [[4, 6]]]);
  const rejoined = { ...divided, ...joinSplitClips(divided, 'a') }; expect(clipGroups(rejoined)).toHaveLength(2);
  expect(() => parseEdit({ ...joined, clips: [...joined.clips!, { ...joined.clips![0], id: 'bad' }] }, asset)).toThrow('Joined pieces must stay together');
});

it('trims through internal cuts from either side and restores hidden pieces after save', () => {
  const edit: EditSettings = { ...defaultSettings(asset), clips: [{ id: 'a', start: 0, end: 2, effects: {} }, { id: 'b', start: 4, end: 6, effects: {} }] };
  const joined = { ...edit, ...joinSplitClips(edit, 'a') };
  for (const range of [{ start: 2.5, end: 4 }, { start: 0, end: 1.5 }, { start: 1.99, end: 2.05 }]) {
    const trimmed = { ...joined, ...resizeClipGroup(joined, joined.clips!, range, 6) };
    expect(editedDuration(trimmed)).toBeCloseTo(range.end - range.start);
    expect(clipGroups(trimmed)).toHaveLength(1);
    const saved = parseEdit(JSON.parse(JSON.stringify({ ...trimmed, start: trimmed.clips![0].start, end: trimmed.clips!.at(-1)!.end })), asset);
    const restored = { ...saved, ...resizeClipGroup(saved, saved.clips!, { start: 0, end: 4 }, 6) };
    expect(restored.clips!.map(({ start, end }) => [start, end])).toEqual([[0, 2], [4, 6]]);
  }
});
it('partitions restore ranges when splitting a joined bar', () => {
  const edit: EditSettings = { ...defaultSettings(asset), clips: [{ id: 'a', start: 0, end: 2, effects: {} }, { id: 'b', start: 4, end: 6, effects: {} }] };
  const joined = { ...edit, ...joinSplitClips(edit, 'a') };
  const split = { ...joined, ...splitClip(joined, 'b', 5) };
  expect(split.clips![0].joinedRanges).toEqual([{ start: 0, end: 2 }, { start: 4, end: 5 }]);
  expect(split.clips!.at(-1)!.joinedRanges).toEqual([{ start: 5, end: 6 }]);
  expect(() => parseEdit(JSON.parse(JSON.stringify(split)), asset)).not.toThrow();
});
it('can restore outer source edges without changing the duration of the omitted middle', () => {
  const edit: EditSettings = { ...defaultSettings(asset), clips: [{ id: 'a', start: 1, end: 2, effects: {} }, { id: 'b', start: 4, end: 5, effects: {} }] };
  const joined = { ...edit, ...joinSplitClips(edit, 'a') };
  const expanded = { ...joined, ...resizeClipGroup(joined, joined.clips!, { start: -1, end: 3 }, 6) };
  expect(expanded.clips!.map(({ start, end }) => [start, end])).toEqual([[0, 2], [4, 6]]);
  expect(editedDuration(expanded)).toBe(4);
});
