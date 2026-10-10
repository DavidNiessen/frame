import { expect, it } from 'vitest';
import { parseProject, type ProjectDocument } from '../src/core/project';
import { MAX_PROJECT_BYTES, serializeProject } from '../src/core/project-storage';
import { editableMediaTags } from '../src/core/media-tags';
import { defaultSettings, type MediaAsset } from '../src/core/types';
const asset: MediaAsset = { id: 'song', name: 'song.wav', size: 100, duration: 3, kind: 'audio', hasAudio: true, previewUrl: '' };
const entry = (text: string) => ({ source: { name: asset.name, size: asset.size, duration: asset.duration, kind: asset.kind, hasAudio: true }, edit: { ...defaultSettings(asset), outputTags: Object.fromEntries(editableMediaTags.map(key => [key, text])) } });
const document = (source: ReturnType<typeof entry>, count: number): ProjectDocument => ({ version: 1, name: 'Collection', selectedSource: 0, sources: Array(count).fill(source) });
it('measures actual UTF-8 bytes and rejects files the importer could not reopen', () => {
  const project = document(entry('音'.repeat(2000)), 400), compact = JSON.stringify(project);
  expect(compact.length).toBeLessThan(MAX_PROJECT_BYTES); expect(new TextEncoder().encode(compact).byteLength).toBeGreaterThan(MAX_PROJECT_BYTES);
  expect(() => serializeProject(project)).toThrow('16 MB');
});
it('falls back to compact JSON near the limit and keeps the saved project readable', () => {
  const source = entry('a'.repeat(2000)), count = Math.floor((MAX_PROJECT_BYTES - 1000) / new TextEncoder().encode(JSON.stringify(source)).byteLength), project = document(source, count);
  expect(new TextEncoder().encode(JSON.stringify(project, null, 2)).byteLength).toBeGreaterThan(MAX_PROJECT_BYTES);
  const saved = serializeProject(project); expect(new TextEncoder().encode(saved).byteLength).toBeLessThanOrEqual(MAX_PROJECT_BYTES); expect(parseProject(JSON.parse(saved)).sources).toHaveLength(count);
  expect(serializeProject(document(source, 1))).toContain('\n');
});
