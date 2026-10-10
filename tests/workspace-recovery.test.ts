import { expect, it } from 'vitest';
import { recoveredEdits } from '../src/core/workspace-recovery';
import { createProject, sourceIdentity } from '../src/core/project';
import { defaultSettings, type MediaAsset } from '../src/core/types';
const source = (id: string): MediaAsset => ({ id, name: 'same.wav', size: 100, kind: 'audio', duration: 5, hasAudio: true, previewUrl: 'blob:old' });
function fixture() {
  const first = source('first'), second = source('second');
  const edit = { ...defaultSettings(first), start: 1, audioLayers: [{ id: 'music', sourceId: second.id, source: sourceIdentity(second), start: 0, end: 2, sourceStart: 0, sourceEnd: 2, volume: .5, fadeIn: 0, fadeOut: 0, muted: false, loop: false }] };
  return { version: 1 as const, savedAt: Date.now(), project: createProject('Mix', [first, second], id => id === first.id ? edit : defaultSettings(second), first.id) };
}
it('remaps duplicate source names by their exact saved index', () => {
  const recovered = recoveredEdits({ document: fixture(), assets: [source('new-first'), source('new-second')], sourceIds: ['new-first', 'new-second'], issues: [] });
  expect(recovered.entries[0].edit.start).toBe(1);
  expect(recovered.entries[0].edit.audioLayers?.[0].sourceId).toBe('new-second');
  expect(recovered.entries[0].edit.audioLayers?.[0].sourceIndex).toBeUndefined();
  expect(recovered.selected).toBe('new-first'); expect(recovered.issues).toEqual([]);
});
it('omits unavailable linked audio instead of linking it to an identically named file', () => {
  const recovered = recoveredEdits({ document: fixture(), assets: [source('new-first')], sourceIds: ['new-first', null], issues: ['Missing second source'] });
  expect(recovered.entries[0].edit.audioLayers).toEqual([]); expect(recovered.issues).toHaveLength(2);
});
it('selects an available source when the saved selection is missing and rejects changed sources', () => {
  const recovered = recoveredEdits({ document: fixture(), assets: [source('second')], sourceIds: [null, 'second'], issues: [] });
  expect(recovered.selected).toBe('second');
  expect(recoveredEdits({ document: fixture(), assets: [{ ...source('first'), size: 999 }], sourceIds: ['first', null], issues: [] }).entries).toEqual([]);
});
