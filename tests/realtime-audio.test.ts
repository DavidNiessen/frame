import { expect, it, vi } from 'vitest';
import {
  realtimeEqualizers,
  realtimeNoise,
  startPlaybackAudio,
  releasePlaybackAudio,
  updatePlaybackAudio,
} from '../src/core/realtime-audio';
import { effectPreviewNeeds, needsEffectPreview, reducesNoise } from '../src/core/effect-preview';
import { clipRecipe } from '../src/core/clips';
import { defaultSettings, type MediaAsset } from '../src/core/types';
const asset = { kind: 'video', duration: 3600, hasAudio: true } as MediaAsset;
it('uses live EQ/gain for long sources but retains exact processing for noise, normalization and visual effects', () => {
  const edit = { ...defaultSettings(asset), volume: 2, equalizer: { bass: 6, mid: -4, treble: 3 } };
  expect(needsEffectPreview(edit, true)).toBe(false);
  expect(needsEffectPreview(edit, false)).toBe(true);
  expect(needsEffectPreview({ ...edit, reduceNoise: true }, true)).toBe(true);
  // Browsers with AudioWorklet reduce noise live while playing.
  expect(effectPreviewNeeds({ ...edit, reduceNoise: true }, true, true, false, true).audio).toBe(
    false,
  );
  expect(needsEffectPreview({ ...edit, normalizeLoudness: true }, true)).toBe(true);
  expect(needsEffectPreview({ ...edit, visual: { ...edit.visual!, exposure: 0.5 } }, true)).toBe(
    true,
  );
});

it('disconnects detached media and reconnects the existing source rather than creating an invalid duplicate', async () => {
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const source = node(),
    gain = { ...node(), gain: { value: 1 } },
    analyser = node();
  const createSource = vi.fn(() => source);
  class Context {
    state = 'running';
    currentTime = 0;
    destination = node();
    createMediaElementSource = createSource;
    createGain = () => gain;
    createAnalyser = () => analyser;
  }
  vi.stubGlobal('AudioContext', Context);
  try {
    const media = {} as HTMLMediaElement;
    await startPlaybackAudio(media);
    expect(updatePlaybackAudio(media, [], 2)).toBe(true);
    expect(gain.gain.value).toBe(2);
    source.disconnect.mockClear();
    releasePlaybackAudio(media);
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    expect(analyser.disconnect).toHaveBeenCalledTimes(1);
    expect(updatePlaybackAudio(media, [], 1)).toBe(false);
    await startPlaybackAudio(media);
    expect(createSource).toHaveBeenCalledTimes(1);
    expect(source.connect).toHaveBeenCalledTimes(2);
    releasePlaybackAudio(media);
    await startPlaybackAudio(media, () => false);
    expect(source.connect).toHaveBeenCalledTimes(2);
  } finally {
    vi.unstubAllGlobals();
  }
});
it('preserves independent stacked EQ, source intervals, local overrides and output intervals after cuts', () => {
  const edit = {
    ...defaultSettings(asset),
    effectRanges: { equalizer: { start: 10, end: 20 } },
    equalizer: { bass: 3, mid: 0, treble: 0 },
    effectInstances: [
      {
        id: 'eq',
        effect: 'equalizer' as const,
        timeSpace: 'output' as const,
        range: { start: 0, end: 2 },
        settings: { equalizer: { bass: 0, mid: -6, treble: 0 } },
      },
    ],
  };
  const recipe = clipRecipe(edit, { id: 'clip', start: 15, end: 30, effects: {} });
  expect(realtimeEqualizers(recipe, 16, 1)).toEqual([
    edit.equalizer,
    edit.effectInstances[0].settings.equalizer,
  ]);
  expect(realtimeEqualizers(recipe, 18, 3)).toEqual([edit.equalizer]);
  expect(realtimeEqualizers(recipe, 21, 4)).toEqual([]);
});

it('reduces noise live within its source and output intervals, in stacking order', () => {
  const edit = {
    ...defaultSettings(asset),
    reduceNoise: true,
    noiseStrength: 20,
    noiseFloor: -40,
    effectRanges: { noise: { start: 10, end: 20 } },
    effectInstances: [
      {
        id: 'late',
        effect: 'noise' as const,
        timeSpace: 'output' as const,
        range: { start: 100, end: 200 },
        settings: { reduceNoise: true, noiseStrength: 8, noiseFloor: -60 },
      },
    ],
  };
  expect(reducesNoise(edit)).toBe(true);
  expect(reducesNoise(defaultSettings(asset))).toBe(false);
  expect(realtimeNoise(edit, 5, 5)).toEqual([]);
  expect(realtimeNoise(edit, 15, 150)).toEqual([
    { strength: 20, floor: -40 },
    { strength: 8, floor: -60 },
  ]);
  expect(realtimeNoise(edit, 15, 50)).toEqual([{ strength: 20, floor: -40 }]);
});
