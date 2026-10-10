import { expect, it } from 'vitest';
import { parseExportHistory, type ExportHistoryEntry } from '../src/core/export-history';
it('keeps bounded recent-output metadata and rejects malformed or duplicate records', () => {
  const entry: ExportHistoryEntry = { id: 'saved', name: 'song.flac', path: '/output/song.flac', source: 'song.wav', size: 1200, format: 'flac', kind: 'watch', savedAt: 1000 };
  expect(parseExportHistory({ version: 1, entries: [entry] })).toEqual([entry]);
  for (const entries of [[{ ...entry, size: -1 }], [{ ...entry, format: 'exe' }], [{ ...entry, path: 'file\0.flac' }], [entry, entry], Array.from({ length: 101 }, (_, index) => ({ ...entry, id: String(index) }))]) expect(() => parseExportHistory({ version: 1, entries })).toThrow();
  expect(() => parseExportHistory({ version: 2, entries: [] })).toThrow();
});
