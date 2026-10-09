import { expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { uniqueArchivePath } from '../src/core/archive-paths';
import { createDownloadArchive } from '../src/engines/download-archive';

it('keeps album folders and numbers colliding filenames in a real download ZIP', async () => {
  const url = URL.createObjectURL(new Blob(['converted media']));
  try {
    const results = [
      { name: 'Song.flac', relativePath: 'Album/Song.flac', url, size: 15 },
      { name: 'Song.flac', relativePath: 'Album/Song.flac', url, size: 15 },
      { name: 'Song.flac', relativePath: 'Another/Song.flac', url, size: 15 },
    ];
    const archive = await createDownloadArchive(results, new AbortController().signal, () => {});
    const files = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    expect(Object.keys(files)).toEqual(['Album/Song.flac', 'Album/Song-1.flac', 'Another/Song.flac']);
    expect(new TextDecoder().decode(files['Album/Song-1.flac'])).toBe('converted media');
    expect(() => uniqueArchivePath('../outside.flac', new Set())).toThrow('Invalid download');
  } finally { URL.revokeObjectURL(url); }
});
it('aborts archive preparation without returning a partial download', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(createDownloadArchive([{ name: 'song.mp3', url: 'blob:unused', size: 1 }], controller.signal, () => {})).rejects.toThrow();
});
