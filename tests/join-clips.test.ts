import { expect, it } from 'vitest';
import { editClips, splitClip } from '../src/core/clips';
import { adjacentSplitJoin, joinSplitClips } from '../src/core/join-clips';
import { addTimelineEffect } from '../src/core/timeline-effects';
import { editedDuration } from '../src/core/timeline';
import { parseEdit } from '../src/core/project';
import { defaultSettings, type MediaAsset } from '../src/core/types';
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
it('rejects removed gaps, reversed clips and different legacy adjustments', () => {
  const edit = split(), [left, right] = edit.clips!;
  for (const clips of [[left, { ...right, start: 4 }], [right, left], [left, { ...right, effects: { volume: .5 } }]]) {
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
