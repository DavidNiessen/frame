import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import {
  joinedPreviewArgs,
  joinedPreviewRanges,
  previewCoversRanges,
} from '../src/core/joined-preview';
import { applyPreviewEffects } from '../src/hooks/usePreviewEffects';
import {
  configurePreviewClock,
  previewMediaTime,
  previewSourceTime,
} from '../src/core/preview-clock';
import { previewPlaybackStep } from '../src/core/preview-playback';
import { defaultSettings, type MediaAsset } from '../src/core/types';
import { ffmpegPath, probeFile } from '../electron/native';
const ranges = [
  { start: 0, end: 2 },
  { start: 4, end: 6 },
];
it('maps the continuous decoder clock to retained source ranges at the cut and end', () => {
  expect(previewSourceTime(ranges, 1.99)).toBe(1.99);
  expect(previewSourceTime(ranges, 2)).toBe(4);
  expect(previewSourceTime(ranges, 2.1)).toBeCloseTo(4.1);
  expect(previewSourceTime(ranges, 4)).toBe(6);
  expect(previewMediaTime(ranges, 4.1)).toBeCloseTo(2.1);
  expect(previewMediaTime(ranges, 3)).toBe(2);
  expect(previewMediaTime(ranges, 6)).toBe(4);
});
it('does not seek at a deleted gap when playing a continuous preview', () => {
  const edit = {
    ...defaultSettings({ duration: 6, kind: 'video' } as MediaAsset),
    clips: ranges.map((range, i) => ({ ...range, id: String(i), groupId: 'joined', effects: {} })),
  };
  expect(previewPlaybackStep(edit, 1.99, '0', true)).toEqual({ time: 1.99, clipId: '0' });
  expect(previewPlaybackStep(edit, 4.03, '0', true)).toEqual({ time: 4.03, clipId: '1' });
  expect(previewPlaybackStep(edit, 5.99, '1', true)).toEqual({ time: 5.99, clipId: '1' });
  expect(previewPlaybackStep(edit, 6, '1', true).time).toBeNull();
  expect(joinedPreviewRanges(edit)).toEqual(ranges);
  const split = {
    ...edit,
    clips: [
      { ...edit.clips[0], end: 1 },
      { ...edit.clips[0], start: 1, id: 'third' },
      edit.clips[1],
    ],
  };
  expect(joinedPreviewRanges(split)).toEqual(ranges);
});
it('renders real continuous video and audio with deleted footage excluded', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-preview-test-')),
    input = resolve('tests/fixtures/sample.mp4');
  try {
    const source = { ...(await probeFile(input)), id: 'a', name: 'sample.mp4', previewUrl: '' };
    for (const kind of ['video', 'audio'] as const) {
      const output = join(directory, kind === 'video' ? 'joined.mp4' : 'joined.mp3');
      await promisify(execFile)(
        ffmpegPath(),
        joinedPreviewArgs({ ...source, kind }, ranges, input, output),
      );
      const asset = await probeFile(output);
      expect(asset.duration).toBeCloseTo(4, 1);
      expect(asset.kind).toBe(kind);
    }
    expect(() =>
      joinedPreviewArgs(source, [{ start: 1, end: Infinity }], input, 'bad.mp4'),
    ).toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
it('evaluates timed preview effects and speed against the source/output clock after a cut', () => {
  const base = defaultSettings({ duration: 6, kind: 'video', hasAudio: true } as MediaAsset);
  const edit = {
    ...base,
    clips: ranges.map((range, i) => ({ ...range, id: String(i), groupId: 'joined', effects: {} })),
    effectInstances: [
      {
        id: 'gain',
        effect: 'volume' as const,
        timeSpace: 'output' as const,
        range: { start: 2, end: 3 },
        settings: { volume: 0.4 },
      },
      {
        id: 'fade',
        effect: 'videoFadeOut' as const,
        timeSpace: 'output' as const,
        range: { start: 2, end: 4 },
        settings: { videoFadeOut: 2 },
      },
    ],
  };
  const media = {
    currentTime: 2.25,
    playbackRate: 1,
    volume: 1,
    tagName: 'VIDEO',
    dataset: {},
    style: {},
  } as HTMLMediaElement;
  configurePreviewClock(media, ranges);
  applyPreviewEffects(media, edit);
  expect(media.volume).toBeCloseTo(0.4);
  expect(Number(media.style.opacity)).toBeCloseTo(0.875);
  const faster = {
    ...edit,
    speed: 2,
    effectInstances: edit.effectInstances.map((instance) => ({
      ...instance,
      range: { start: instance.range.start / 2, end: instance.range.end / 2 },
    })),
  };
  applyPreviewEffects(media, faster);
  expect(media.playbackRate).toBe(2);
  expect(media.volume).toBeCloseTo(0.4);
  expect(Number(media.style.opacity)).toBeCloseTo(0.875);
});
it('prepares removed sections and reordered splits independently of Join', () => {
  const base = defaultSettings({ duration: 6, kind: 'video' } as MediaAsset);
  const clips = ranges.map((range, i) => ({ ...range, id: String(i), effects: {} }));
  expect(joinedPreviewRanges({ ...base, clips })).toEqual(ranges);
  expect(joinedPreviewRanges({ ...base, clips: [clips[1], clips[0]] })).toEqual(
    [...ranges].reverse(),
  );
  expect(joinedPreviewRanges({ ...base, cuts: [{ start: 2, end: 4 }], splits: [1, 5] })).toEqual(
    ranges,
  );
  expect(joinedPreviewRanges({ ...base, splits: [2, 4] })).toBeNull();
  expect(joinedPreviewRanges({ ...base, clips: [{ ...clips[0], end: 4 }, clips[1]] })).toBeNull();
});
it('retains an older preview for trimmed footage but falls back when expanding reveals new footage', () => {
  expect(previewCoversRanges([{ start: 0, end: 6 }], ranges)).toBe(true);
  expect(
    previewCoversRanges(ranges, [
      { start: 0.5, end: 1.5 },
      { start: 4, end: 5 },
    ]),
  ).toBe(true);
  expect(
    previewCoversRanges(ranges, [
      { start: 0, end: 3 },
      { start: 4, end: 6 },
    ]),
  ).toBe(false);
});
