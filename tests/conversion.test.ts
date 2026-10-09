import { expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectFolderMedia } from '../electron/folders';
import { canConvert, conversionName, conversionSettings } from '../src/core/conversion';
import { outputSettings } from '../src/core/presets';
import { defaultSettings, type MediaAsset } from '../src/core/types';
import { validateEdit } from '../src/core/export-plan';

const song: MediaAsset = { id: 'song', name: 'Song.wav', relativePath: 'Album/Song.wav', size: 100, kind: 'audio', duration: 10, hasAudio: true, previewUrl: '' };
it('converts the full source with independent output settings and artwork enabled', () => {
  const edited = { ...defaultSettings(song), start: 2, end: 3, volume: .2, speed: 2, cuts: [{ start: 2.2, end: 2.5 }], format: 'flac' as const };
  const converted = conversionSettings(song, outputSettings(edited));
  expect([converted.start, converted.end, converted.volume, converted.speed]).toEqual([0, 10, 1, 1]);
  expect(converted.cuts).toEqual([]); expect(converted.includeArtwork).toBe(true); expect(converted.format).toBe('flac');
  validateEdit(song, converted);
  expect(canConvert(song, { ...outputSettings(edited), format: 'mp4' })).toBe(false);
});
it('keeps conversion filenames and portable album paths without allowing traversal', () => {
  expect(conversionName(song, 'flac')).toBe('Song.flac');
  expect(conversionName(song, 'flac', true)).toBe('Album/Song.flac');
  expect(conversionName({ ...song, name: 'Song-edited.wav' }, 'mp3')).toBe('Song-edited.mp3');
  expect(() => conversionName({ ...song, relativePath: '../Song.wav' }, 'flac', true)).toThrow('Invalid source folder');
});
it('discovers nested media with stable relative paths and ignores non-media and linked directories', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-folder-test-'));
  try {
    const root = join(directory, 'Music'); await mkdir(join(root, 'Album'), { recursive: true });
    await writeFile(join(root, 'Album', 'Song.WAV'), 'source'); await writeFile(join(root, 'cover.jpg'), 'cover');
    const outside = join(directory, 'Outside'); await mkdir(outside); await writeFile(join(outside, 'Private.mp3'), 'source');
    await symlink(outside, join(root, 'linked'), 'junction');
    const found = await collectFolderMedia(root);
    expect(found.files.map(file => file.relativePath)).toEqual(['Album/Song.WAV']); expect(found.skipped).toBe(2);
    expect((await collectFolderMedia(outside)).files.map(file => file.relativePath)).toEqual(['Private.mp3']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
