import { expect, it } from 'vitest';
import { insertedAudioLayer, insertedVideoEdit } from '../src/core/media-insertion';
import { defaultSettings, type MediaAsset } from '../src/core/types';
import { addTimelineEffect } from '../src/core/timeline-effects';
import { editedDuration } from '../src/core/timeline';
import { parseEdit } from '../src/core/project';
import { sectionLimits, resizeSection } from '../src/core/timeline-edit';
import { joinSplitClips } from '../src/core/join-clips';
import { effectLibrary } from '../src/core/effect-library';
const video: MediaAsset = {
  id: 'video',
  name: 'first.mp4',
  kind: 'video',
  duration: 6,
  width: 640,
  height: 360,
  frameRate: 30,
  size: 100,
  hasAudio: true,
  previewUrl: '',
};
const other = { ...video, id: 'other', name: 'second.mp4' },
  prepared = { ...video, id: 'sequence', name: 'sequence.mp4', duration: 12 };
it('extends trimmed footage while preserving independent effects and undoable source boundaries', () => {
  let edit = {
    ...defaultSettings(video),
    start: 1,
    end: 5,
    speed: 2,
    cuts: [{ start: 2, end: 3 }],
    splits: [4],
  };
  edit = { ...edit, ...addTimelineEffect(edit, video, 'captions', 1) };
  const { before, after } = insertedVideoEdit(video, other, prepared, edit, 'inserted');
  expect(editedDuration(before)).toBe(1.5);
  expect(editedDuration(after)).toBe(4.5);
  expect(after.clips?.map((clip) => [clip.start, clip.end])).toEqual([
    [1, 2],
    [3, 4],
    [4, 5],
    [6, 12],
  ]);
  expect(after.effectInstances).toEqual(edit.effectInstances);
  expect(after.clips?.at(-1)?.source).toEqual({ name: 'second.mp4', start: 6, end: 12 });
  expect(parseEdit(JSON.parse(JSON.stringify(after)), prepared)).toMatchObject({
    clips: after.clips,
  });
  expect(sectionLimits(before, 2, prepared.duration).end).toBe(6);
  expect(edit.clips).toBeUndefined();
});
it('restores trimmed inserted edges without exposing another video and joins across sources deliberately', () => {
  let edit = insertedVideoEdit(video, other, prepared, defaultSettings(video), 'inserted').after;
  edit = { ...edit, ...resizeSection(edit, 1, { start: 8, end: 10 }, 12) };
  edit = { ...edit, ...resizeSection(edit, 1, { start: 8, end: 30 }, 12) };
  expect(edit.clips![1].end).toBe(12);
  edit = { ...edit, ...resizeSection(edit, 1, { start: 0, end: 12 }, 12) };
  expect(edit.clips![1].start).toBe(6);
  const withoutFirst = { ...edit, start: 8, clips: [{ ...edit.clips![1], start: 8 }] };
  expect(sectionLimits(withoutFirst, 0, 12).start).toBe(6);
  const joined = { ...edit, ...joinSplitClips(edit, edit.clips![0].id) };
  expect(joined.clips).toHaveLength(1);
  expect(joined.clips![0].source).toBeUndefined();
  expect(() => parseEdit(joined, prepared)).not.toThrow();
  expect(() =>
    parseEdit(
      { ...edit, clips: [{ ...edit.clips![0], source: { name: 'wrong', start: 2, end: 3 } }] },
      prepared,
    ),
  ).toThrow('source boundaries');
});
it('adds independent library audio at the output playhead after cuts and speed changes', () => {
  const audio: MediaAsset = { ...video, id: 'audio', name: 'song.wav', kind: 'audio', duration: 3 };
  const edit = { ...defaultSettings(video), speed: 2, cuts: [{ start: 2, end: 4 }] };
  const first = insertedAudioLayer(edit, audio, 5, 'one'),
    second = insertedAudioLayer(edit, audio, 5, 'two');
  expect(first).toMatchObject({
    start: 1.5,
    end: 2,
    sourceId: 'audio',
    sourceStart: 0,
    sourceEnd: 3,
    volume: 1,
  });
  expect(second.id).not.toBe(first.id);
  expect(() =>
    insertedAudioLayer(
      { ...edit, audioLayers: Array.from({ length: 16 }, (_, i) => ({ ...first, id: String(i) })) },
      audio,
      0,
    ),
  ).toThrow('16 audio layers');
  expect(effectLibrary.some((effect) => effect.id === 'mix')).toBe(false);
});
