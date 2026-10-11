import { describe, expect, it } from 'vitest';
import { effectAction, clearClipEffects, existingEffectTarget } from '../src/core/effect-actions';
import { appliedEffects, effectLibrary } from '../src/core/effect-library';
import { defaultSettings, type MediaAsset } from '../src/core/types';
import { clipRecipe, editClips, splitClip } from '../src/core/clips';
import { parseEdit } from '../src/core/project';
import { buildExportArgs } from '../src/core/export-plan';
import { clipEffectRows } from '../src/core/effect-timeline';
const asset = { duration: 6, kind: 'video', hasAudio: true, width: 640, height: 360 } as MediaAsset;
const find = (id: string) => effectLibrary.find((effect) => effect.id === id)!;
const split = () => {
  const edit = defaultSettings(asset);
  return { ...edit, ...splitClip(edit, editClips(edit)[0].id, 3) };
};
describe('persistent effect application', () => {
  it('keeps neutral volume, speed and transforms editable on the timeline', () => {
    let edit = split();
    const id = edit.clips![1].id;
    const original = buildExportArgs(asset, edit, 'input', 'output');
    for (const effect of ['volume', 'speed', 'transform'])
      edit = { ...edit, ...effectAction(edit, asset, find(effect), id, 'add') };
    expect(
      clipEffectRows(asset, edit).map((row) => [
        row.effect.id,
        row.items.map((item) => item.index),
      ]),
    ).toEqual([
      ['volume', [1]],
      ['speed', [1]],
      ['transform', [1]],
    ]);
    expect(buildExportArgs(asset, edit, 'input', 'output')).toEqual(original);
    edit = { ...edit, ...effectAction(edit, asset, find('volume'), id, 'reset') };
    expect(clipEffectRows(asset, edit)[0].effect.id).toBe('volume');
    edit = { ...edit, ...effectAction(edit, asset, find('volume'), id, 'remove') };
    expect(clipEffectRows(asset, edit).map((row) => row.effect.id)).toEqual(['speed', 'transform']);
  });
  it('provides a full clip settings bar for explicitly added fades reset to zero', () => {
    let edit = defaultSettings(asset);
    edit = { ...edit, ...effectAction(edit, asset, find('audioFadeIn'), null, 'add') };
    expect(clipEffectRows(asset, edit)).toEqual([]);
    edit = { ...edit, ...effectAction(edit, asset, find('audioFadeIn'), null, 'reset') };
    expect(clipEffectRows(asset, edit).map((row) => row.effect.id)).toEqual(['audioFadeIn']);
    edit = { ...edit, ...effectAction(edit, asset, find('audioFadeIn'), null, 'remove') };
    expect(clipEffectRows(asset, edit)).toEqual([]);
  });
  it('keeps a legacy standard effect in controls after resetting it', () => {
    let edit = { ...defaultSettings(asset), crop: { x: 0, y: 0, width: 100, height: 100 } };
    edit = { ...edit, ...effectAction(edit, asset, find('crop'), null, 'reset') } as typeof edit;
    expect(edit.crop).toBeNull();
    expect(appliedEffects(asset, edit, null).map((effect) => effect.id)).toEqual(['crop']);
  });
  it('retains a neutral effect through project parsing and resetting without changing output', () => {
    let edit = defaultSettings(asset);
    const original = buildExportArgs(asset, edit, 'input', 'output');
    edit = { ...edit, ...effectAction(edit, asset, find('color'), null, 'add') };
    expect(appliedEffects(asset, edit, null).map((e) => e.id)).toEqual(['color']);
    expect(buildExportArgs(asset, edit, 'input', 'output')).toEqual(original);
    edit = parseEdit(JSON.parse(JSON.stringify(edit)), asset);
    edit.color.brightness = 0.2;
    edit = { ...edit, ...effectAction(edit, asset, find('color'), null, 'reset') };
    expect(edit.color.brightness).toBe(0);
    expect(edit.addedEffects).toEqual(['color']);
    edit = { ...edit, ...effectAction(edit, asset, find('color'), null, 'remove') };
    expect(appliedEffects(asset, edit, null)).toEqual([]);
  });
  it('removes an inherited neutral effect on one clip while preserving its neighbour', () => {
    let edit = split();
    const [first, second] = edit.clips!;
    edit = { ...edit, ...effectAction(edit, asset, find('equalizer'), null, 'add') };
    edit = { ...edit, ...effectAction(edit, asset, find('equalizer'), second.id, 'remove') };
    expect(appliedEffects(asset, edit, first.id).map((e) => e.id)).toEqual(['equalizer']);
    expect(appliedEffects(asset, edit, second.id)).toEqual([]);
    expect(
      parseEdit(JSON.parse(JSON.stringify(edit)), asset).clips![1].effects.addedEffects,
    ).toEqual([]);
  });
  it('adds across clips without erasing other neutral controls or clip-specific values', () => {
    let edit = split();
    const second = edit.clips![1].id;
    edit = { ...edit, ...effectAction(edit, asset, find('color'), second, 'add') };
    edit.clips![1].effects.volume = 0.4;
    edit = { ...edit, ...effectAction(edit, asset, find('equalizer'), null, 'add') };
    expect(appliedEffects(asset, edit, second).map((e) => e.id)).toEqual([
      'volume',
      'equalizer',
      'color',
    ]);
    expect(clipRecipe(edit, edit.clips![1]).volume).toBe(0.4);
    edit = { ...edit, ...clearClipEffects(edit, asset, second) };
    expect(clipRecipe(edit, edit.clips![1]).volume).toBe(1);
    expect(appliedEffects(asset, edit, second)).toEqual([]);
    expect(appliedEffects(asset, edit, edit.clips![0].id).map((e) => e.id)).toEqual(['equalizer']);
    expect(edit.clips!.map((c) => [c.start, c.end])).toEqual([
      [0, 3],
      [3, 6],
    ]);
  });
  it('preserves source effects when clearing clip adjustments and rejects malformed memberships', () => {
    let edit = split();
    edit = { ...edit, ...effectAction(edit, asset, find('captions'), null, 'add'), volume: 0.5 };
    edit = { ...edit, ...clearClipEffects(edit, asset, null) };
    expect(appliedEffects(asset, edit, null).map((e) => e.id)).toEqual(['captions']);
    for (const addedEffects of [['unknown'], ['color', 'color'], 'color', Array(100).fill('color')])
      expect(() => parseEdit({ ...edit, addedEffects }, asset)).toThrow('Invalid added effects');
  });
});

describe('catalogue repeat policy', () => {
  it('reuses every singleton adjustment without resetting its settings or stacking filters', () => {
    for (const effect of effectLibrary.filter((effect) => !effect.repeatable)) {
      let edit = defaultSettings(asset);
      edit = { ...edit, ...effectAction(edit, asset, effect, null, 'add') };
      expect(existingEffectTarget(edit, asset, effect, null)).toEqual({ clipId: null });
      expect(effectAction(edit, asset, effect, null, 'add')).toEqual({});
      expect(edit.effectInstances ?? []).toHaveLength(0);
    }
    const edit = { ...defaultSettings(asset), speed: 2 };
    expect(effectAction(edit, asset, find('speed'), null, 'add')).toEqual({});
    expect(edit.speed).toBe(2);
  });
  it('permits the same adjustment on another clip but reopens the selected clip on repeats', () => {
    let edit = split();
    const [a, b] = edit.clips!;
    edit = { ...edit, ...effectAction(edit, asset, find('crop'), a.id, 'add') };
    expect(existingEffectTarget(edit, asset, find('crop'), b.id)).toBeNull();
    edit = { ...edit, ...effectAction(edit, asset, find('crop'), b.id, 'add') };
    expect(existingEffectTarget(edit, asset, find('crop'), b.id)).toEqual({ clipId: b.id });
    expect(effectAction(edit, asset, find('crop'), b.id, 'add')).toEqual({});
    expect(edit.clips!.every((clip) => clip.effects.addedEffects?.includes('crop'))).toBe(true);
  });
  it('keeps captions and artwork independent and finds existing legacy stacks', () => {
    for (const id of ['captions', 'watermark']) {
      let edit = defaultSettings(asset);
      for (let i = 0; i < 3; i++)
        edit = { ...edit, ...effectAction(edit, asset, find(id), null, 'add', i) };
      expect(edit.effectInstances).toHaveLength(2);
      expect(existingEffectTarget(edit, asset, find(id), null)).toBeNull();
    }
    const edit = {
      ...defaultSettings(asset),
      effectInstances: [{ id: 'legacy-crop', effect: 'crop' as const, settings: { crop: null } }],
    };
    expect(existingEffectTarget(edit, asset, find('crop'), null)).toEqual({
      clipId: null,
      instanceId: 'legacy-crop',
    });
    expect(effectAction(edit, asset, find('crop'), null, 'add')).toEqual({});
  });
});
