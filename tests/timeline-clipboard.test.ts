import { expect, it } from 'vitest';
import { defaultCaptionStyle } from '../src/core/caption-style';
import { sourceIdentity } from '../src/core/project';
import type { AudioLayer } from '../src/core/audio-layers';
import { copySection, pasteTimeline, clipboardUnavailable } from '../src/core/timeline-clipboard';
import { clipGroups } from '../src/core/clip-groups';
import { editClips, splitClip } from '../src/core/clips';
import { defaultSettings, type MediaAsset } from '../src/core/types';
import { editedDuration } from '../src/core/timeline';
import { validateEdit } from '../src/core/export-plan';
import { outputTimeAtSource } from '../src/core/fades';
import { previewMediaTime, previewSourceTime } from '../src/core/preview-clock';
const asset: MediaAsset = { id: 'video', name: 'video.mp4', duration: 6, size: 1, kind: 'video', hasAudio: true, previewUrl: '', width: 640, height: 360 };
it('pastes independent copies inside a section without losing its retained footage or source bounds', () => {
  const edit = defaultSettings(asset), original = editClips(edit)[0], copied = copySection(edit, asset.id, original.id)!;
  const result = pasteTimeline(copied, edit, asset, 3), next = { ...edit, ...result.patch };
  expect(editClips(next).map(clip => [clip.start, clip.end])).toEqual([[0, 3], [0, 6], [3, 6]]);
  expect(new Set(editClips(next).map(clip => clip.id)).size).toBe(3);
  expect(editedDuration(next)).toBe(12); expect(result.output).toBe(3);
  expect(() => validateEdit(asset, next)).not.toThrow();
  const twice = { ...next, ...splitClip(next, result.id, 2) };
  expect(new Set(editClips(twice).map(clip => clip.id)).size).toBe(4);
  expect(() => validateEdit(asset, twice)).not.toThrow();
  expect(clipboardUnavailable(copied, edit, { ...asset, id: 'other' })).toContain('original source');
});
it('copies a joined section with cuts intact and assigns a distinct group on paste', () => {
  const edit = { ...defaultSettings(asset), clips: [{ id: 'a', start: 0, end: 1, groupId: 'joined', effects: {}, joinedRanges: [{ start: 0, end: 1 }, { start: 3, end: 4 }] }, { id: 'b', start: 3, end: 4, groupId: 'joined', effects: {}, joinedRanges: [{ start: 0, end: 1 }, { start: 3, end: 4 }] }] };
  const copied = copySection(edit, asset.id, 'a')!, next = { ...edit, ...pasteTimeline(copied, edit, asset, 2).patch };
  expect(clipGroups(next)).toHaveLength(2); expect(editedDuration(next)).toBe(4);
  expect(editClips(next).map(clip => [clip.start, clip.end])).toEqual([[0, 1], [3, 4], [0, 1], [3, 4]]);
  expect(next.clips![2].groupId).not.toBe('joined'); expect(() => validateEdit(asset, next)).not.toThrow();
});
it('preserves caption styling and fade length, clamps paste timing and rejects singleton duplicates', () => {
  const edit = defaultSettings(asset);
  const copied = { kind: 'effect' as const, instance: { id: 'caption', effect: 'captions' as const, timeSpace: 'output' as const, settings: { subtitles: { mode: 'burn' as const, cues: [{ start: 0, end: 2, text: 'Hello', style: { ...defaultCaptionStyle, font: 'serif' as const, color: '#ff00ff', bold: true }, position: { x: 10, y: 40 } }] } } } };
  const next = { ...edit, ...pasteTimeline(copied, edit, asset, 5).patch };
  expect(next.effectInstances![0].settings.subtitles!.cues[0]).toMatchObject({ start: 4, end: 6, text: 'Hello', style: { ...defaultCaptionStyle, font: 'serif' as const, color: '#ff00ff', bold: true }, position: { x: 10, y: 40 } });
  expect(copied.instance.settings.subtitles.cues[0].start).toBe(0);
  expect(() => validateEdit(asset, next)).not.toThrow();
  const fade = pasteTimeline({ kind: 'effect', instance: { id: 'fade', effect: 'videoFadeOut', range: { start: 0, end: .5 }, settings: { videoFadeOut: .5 } } }, edit, asset, 4);
  expect(fade.patch.effectInstances![0]).toMatchObject({ range: { start: 4, end: 4.5 }, settings: { videoFadeOut: .5 } });
  expect(() => pasteTimeline({ kind: 'effect', instance: { id: 'crop', effect: 'crop', settings: { crop: null } } }, edit, asset, 0)).toThrow('cannot be duplicated');
});
it('maps repeated source footage onto the intended output occurrence for seeking and playback', () => {
  const edit = { ...defaultSettings(asset), clips: [{ id: 'a', start: 0, end: 6, effects: {} }, { id: 'b', start: 0, end: 6, effects: {} }] };
  const ranges = [{ start: 0, end: 6 }, { start: 0, end: 6 }];
  expect(previewMediaTime(ranges, 2, 8)).toBe(8); expect(previewSourceTime(ranges, 8)).toBe(2);
  expect(outputTimeAtSource(edit, 2, 8)).toBe(8); expect(outputTimeAtSource(edit, 2)).toBe(2);
});

it('duplicates an audio layer with its source segment, independent settings and valid boundary timing', () => {
  const edit = defaultSettings(asset), layer: AudioLayer = { id: 'audio', sourceId: asset.id, source: sourceIdentity(asset), start: 0, end: 2, sourceStart: 1, sourceEnd: 3, volume: .7, fadeIn: .25, fadeOut: .5, loop: false, muted: false };
  const result = pasteTimeline({ kind: 'audio', layer }, { ...edit, audioLayers: [layer] }, asset, 5), next = { ...edit, ...result.patch };
  expect(next.audioLayers).toHaveLength(2); expect(next.audioLayers![1]).toMatchObject({ start: 4, end: 6, sourceStart: 1, sourceEnd: 3, volume: .7, fadeIn: .25, fadeOut: .5 });
  expect(next.audioLayers![1].id).not.toBe(layer.id); next.audioLayers![1].volume = .2; expect(layer.volume).toBe(.7);
  expect(() => validateEdit(asset, next)).not.toThrow();
});
