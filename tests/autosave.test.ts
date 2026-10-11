import { expect, it } from 'vitest';
import { parseAutosave } from '../src/core/autosave';
import { createProject } from '../src/core/project';
import { defaultSettings, type MediaAsset } from '../src/core/types';
it('validates recoverable recipes without retaining transient media URLs or source paths', () => {
  const asset: MediaAsset = {
    id: 'opaque-id',
    name: 'clip.wav',
    size: 100,
    duration: 3,
    kind: 'audio',
    hasAudio: true,
    previewUrl: 'media://asset/opaque-id',
  };
  const project = createProject(
    'Recovery',
    [asset],
    () => ({ ...defaultSettings(asset), start: 1 }),
    asset.id,
  );
  const saved = parseAutosave({ version: 1, savedAt: Date.now(), project });
  expect(saved.project.sources[0].edit.start).toBe(1);
  expect(JSON.stringify(saved)).not.toContain('media://');
  expect(JSON.stringify(saved)).not.toContain('opaque-id');
  expect(() => parseAutosave({ ...saved, version: 2 })).toThrow();
  expect(() =>
    parseAutosave({
      ...saved,
      project: {
        ...project,
        sources: [{ ...project.sources[0], edit: { ...project.sources[0].edit, end: 999 } }],
      },
    }),
  ).toThrow();
});
