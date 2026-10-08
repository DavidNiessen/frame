import { describe, expect, it } from 'vitest';
import { createProject, matchSources, parseProject, projectFilename } from '../src/core/project';
import { defaultSettings, type MediaAsset } from '../src/core/types';
const asset: MediaAsset = { id: 'source', name: 'clip.mp4', size: 1234, kind: 'video', duration: 10, width: 640, height: 360, hasAudio: true, previewUrl: 'media://private/source' };
const edit = { ...defaultSettings(asset), start: 1, end: 9, cuts: [{ start: 3, end: 4 }], splits: [5], crop: { x: 10, y: 20, width: 200, height: 100 }, volume: 0.5 };
const project = () => createProject('My edit', [asset], () => edit, asset.id);
describe('portable projects', () => {
  it('round trips edited timelines and omits machine-specific references', () => {
    const saved = JSON.stringify(project());
    expect(saved).not.toContain('media://'); expect(saved).not.toContain('"id"');
    expect(parseProject(JSON.parse(saved)).sources[0].edit).toEqual(edit);
  });
  it('matches each source once and leaves changed or missing media unlinked', () => {
    const duplicate = { ...asset, id: 'second' };
    const doc = createProject('Duplicate sources', [asset, duplicate], () => edit, duplicate.id);
    expect(matchSources(doc, [asset])).toEqual(['source', null]);
    expect(matchSources(doc, [asset, duplicate])).toEqual(['source', 'second']);
    expect(matchSources(project(), [{ ...asset, duration: 8 }, { ...asset, size: 1235 }])).toEqual([null]);
    expect(matchSources(project(), [{ ...asset, id: 'new', previewUrl: 'blob:other' }])).toEqual(['new']);
  });
  it('rejects unsupported versions, malformed settings, and out-of-bounds recipes', () => {
    expect(() => parseProject({ ...project(), version: 2 })).toThrow('version');
    for (const patch of [{ end: 20 }, { includeArtwork: 'true' }, { crop: { x: 600, y: 0, width: 200, height: 100 } }, { splits: Array(1001).fill(1) }, { cuts: [null] }, { format: 'exe' }]) {
      const doc = project(); Object.assign(doc.sources[0].edit, patch);
      expect(() => parseProject(doc)).toThrow();
    }
    expect(() => parseProject({ ...project(), selectedSource: 1 })).toThrow();
    expect(() => parseProject({ ...project(), sources: [] })).toThrow();
  });
  it('sanitizes project filenames', () => { expect(projectFilename('A/B: edit')).toBe('A_B_ edit.frame.json'); });
});
