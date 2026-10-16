import { expect, it } from 'vitest';
import { sameEditSettings } from '../src/core/edit-equality';
import { defaultSettings, type EditSettings, type MediaAsset } from '../src/core/types';
const asset = { kind: 'video', duration: 120, hasAudio: true } as MediaAsset;
it('recognizes unchanged recipes without reading shared artwork or paint payloads', () => {
  const original = defaultSettings(asset);
  Object.defineProperty(original.painting, 'image', {
    get() {
      throw new Error('Shared paint payload was traversed');
    },
  });
  const next = { ...original, equalizer: { ...original.equalizer }, effectInstances: [] };
  expect(sameEditSettings(original, next)).toBe(true);
  expect(sameEditSettings(original, { ...next, volume: 0.5 })).toBe(false);
});
it('matches recipe serialization for every default option and representative nested changes', () => {
  const original: EditSettings = {
    ...defaultSettings(asset),
    clips: [{ id: 'clip', start: 0, end: 120, effects: { volume: 0.5 } }],
    effectInstances: [
      {
        id: 'caption',
        effect: 'captions',
        timeSpace: 'output',
        settings: {
          subtitles: { mode: 'burn', cues: [{ start: 0, end: 1, text: 'Hello' }] },
        },
      },
    ],
  };
  expect(sameEditSettings(original, structuredClone(original))).toBe(true);
  const check = (value: unknown, path: (string | number)[] = []) => {
    if (value && typeof value === 'object' && Object.keys(value).length) {
      for (const [key, child] of Object.entries(value))
        if (child !== undefined) check(child, [...path, key]);
      return;
    }
    if (!path.length || value === undefined) return;
    const changed = structuredClone(original);
    let target = changed as unknown as Record<string | number, unknown>;
    for (const key of path.slice(0, -1)) target = target[key] as typeof target;
    target[path.at(-1)!] =
      typeof value === 'number'
        ? value + 1
        : typeof value === 'boolean'
          ? !value
          : typeof value === 'string'
            ? `${value} changed`
            : value === null
              ? 1
              : [null];
    expect(JSON.stringify(changed)).not.toBe(JSON.stringify(original));
    expect(sameEditSettings(original, changed), path.join('.')).toBe(false);
  };
  check(original);
});
it('compares object values independently of insertion order while retaining array order', () => {
  const original = defaultSettings(asset);
  const reordered = {
    ...original,
    equalizer: { treble: 0, mid: 0, bass: 0 },
  };
  delete reordered.clips;
  expect(sameEditSettings(original, reordered)).toBe(true);
  expect(sameEditSettings(original, { ...original, outputTags: undefined })).toBe(false);
  expect(
    sameEditSettings({ ...original, splits: [10, 20] }, { ...original, splits: [20, 10] }),
  ).toBe(false);
});
