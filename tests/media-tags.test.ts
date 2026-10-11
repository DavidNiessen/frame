import { expect, it } from 'vitest';
import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { conversionLibrary, probeConversion } from './helpers/conversion-library';
import { parseTagOverrides, mediaTagArgs } from '../src/core/media-tags';
import { defaultSettings } from '../src/core/types';
import { buildExportArgs } from '../src/core/export-plan';
import { parseOutputSettings, outputSettings } from '../src/core/presets';
import { ffmpegPath, probeFile } from '../electron/native';
const exec = promisify(execFile);
it('writes explicit metadata overrides, removes cleared tags and preserves untouched tags', async () => {
  const library = await conversionLibrary();
  try {
    const input = library.sources[0],
      asset = { ...(await probeFile(input)), id: 'song', name: 'Song.wav', previewUrl: '' },
      outputTags = { title: 'New = song; #é', artist: '', album: 'Collected songs' };
    for (const format of ['mp3', 'flac', 'm4a', 'wav'] as const) {
      const output = join(library.directory, `tags.${format}`),
        edit = { ...defaultSettings(asset), format, outputTags };
      await exec(ffmpegPath(), buildExportArgs(asset, edit, input, output));
      const info = await probeConversion(output),
        tags = info.format.tags;
      expect(tags.title).toBe(outputTags.title);
      expect(tags.artist).toBeUndefined();
      expect(tags.album).toBe(outputTags.album);
      expect(parseOutputSettings(outputSettings(edit)).outputTags).toEqual(outputTags);
    }
    const videoPath = resolve('tests/fixtures/sample.mp4'),
      video = { ...(await probeFile(videoPath)), id: 'video', name: 'video.mp4', previewUrl: '' },
      output = join(library.directory, 'tags.mp4');
    await exec(
      ffmpegPath(),
      buildExportArgs(
        video,
        { ...defaultSettings(video), keepMetadata: false, outputTags: { title: 'Explicit title' } },
        videoPath,
        output,
      ),
    );
    expect((await probeConversion(output)).format.tags.title).toBe('Explicit title');
    expect(mediaTagArgs({ title: '-i "bad"\n= literal' })).toEqual([
      '-metadata',
      'title=-i "bad"\n= literal',
    ]);
    expect(parseTagOverrides(undefined)).toEqual({});
    expect(() => parseTagOverrides({ file: 'invalid' })).toThrow();
    expect(() => parseTagOverrides({ title: 'a\0b' })).toThrow();
    expect(() => parseTagOverrides({ title: 'a'.repeat(2001) })).toThrow();
  } finally {
    await rm(library.directory, { recursive: true, force: true });
  }
});
