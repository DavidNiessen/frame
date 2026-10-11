import { describe, expect, it } from 'vitest';
import { clipRecipe, editClips, patchClip, splitClip } from '../src/core/clips';
import { clipEffectRows } from '../src/core/effect-timeline';
import {
  appliedEffects,
  effectActive,
  effectLibrary,
  resetEffect,
} from '../src/core/effect-library';
import { defaultSettings, type EditSettings, type MediaAsset } from '../src/core/types';
const asset = { duration: 6, kind: 'video', hasAudio: true, width: 640, height: 360 } as MediaAsset;
const volume = effectLibrary.find((effect) => effect.id === 'volume')!;
function split(edit = defaultSettings(asset)): EditSettings {
  return { ...edit, ...splitClip(edit, editClips(edit)[0].id, 3) };
}
describe('applied effect management', () => {
  it('removes neutral overrides and ignores neutral keys from older projects', () => {
    let edit = split();
    const id = edit.clips![1].id;
    edit = { ...edit, ...patchClip(edit, id, { volume: 0.5 }) };
    expect(clipEffectRows(asset, edit)[0].items.map((item) => item.index)).toEqual([1]);
    edit = { ...edit, ...patchClip(edit, id, resetEffect(volume, asset)) };
    expect(edit.clips![1].effects).toEqual({});
    expect(clipEffectRows(asset, edit)).toEqual([]);
    edit.clips![1].effects = {
      volume: 1,
      speed: 1,
      audioFadeIn: 0,
      color: defaultSettings(asset).color,
    };
    expect(clipEffectRows(asset, edit)).toEqual([]);
    expect(appliedEffects(asset, edit, null)).toEqual([]);
  });
  it('shows inherited effects and resets one clip without changing its neighbours', () => {
    let edit = split({ ...defaultSettings(asset), volume: 0.5 });
    expect(clipEffectRows(asset, edit)[0].items).toHaveLength(2);
    edit = { ...edit, ...patchClip(edit, edit.clips![1].id, resetEffect(volume, asset)) };
    expect(edit.clips![1].effects).toEqual({ volume: 1 });
    expect(clipRecipe(edit, edit.clips![0]).volume).toBe(0.5);
    expect(clipEffectRows(asset, edit)[0].items.map((item) => item.index)).toEqual([0]);
    expect(appliedEffects(asset, edit, null).map((effect) => effect.id)).toEqual(['volume']);
    expect(appliedEffects(asset, edit, edit.clips![1].id)).toEqual([]);
  });
  it('does not mistake disabled cleanup or unaltered speed for an applied effect', () => {
    const edit = {
      ...defaultSettings(asset),
      targetLufs: -20,
      noiseStrength: 25,
      preservePitch: false,
    };
    for (const id of ['normalize', 'noise', 'speed'])
      expect(
        effectActive(
          effectLibrary.find((effect) => effect.id === id)!,
          edit,
          asset,
        ),
      ).toBe(false);
  });
  it('includes crop in the stack and clears its bar when reset', () => {
    const edit = { ...defaultSettings(asset), crop: { x: 0, y: 0, width: 300, height: 300 } };
    expect(clipEffectRows(asset, edit).map((row) => row.effect.id)).toEqual(['crop']);
    const crop = effectLibrary.find((effect) => effect.id === 'crop')!;
    expect(clipEffectRows(asset, { ...edit, ...resetEffect(crop, asset) })).toEqual([]);
  });
});
