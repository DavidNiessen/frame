import { expect, it } from 'vitest';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { conversionLibrary, probeConversion } from './helpers/conversion-library';
import { ffmpegPath, probeFile } from '../electron/native';
import { parseCoverArtwork } from '../src/core/cover-art';
import { defaultSettings } from '../src/core/types';
import { sourceIdentity, createProject, parseProject } from '../src/core/project';
import { outputSettings } from '../src/core/presets';
import { buildExportArgs } from '../src/core/export-plan';
import { buildMergeArgs } from '../src/core/composition';
import { resourcePaths } from '../src/core/resources';
import { mergedChapters, serializeChapters } from '../src/core/chapters';
const exec = promisify(execFile);
it('embeds custom cover artwork through audio formats, chapters, mixes and merged exports', async () => {
  const library = await conversionLibrary();
  try {
    const png = join(library.directory, 'cover.png');
    await exec(ffmpegPath(), [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=purple:s=64x64',
      '-frames:v',
      '1',
      '-threads',
      '1',
      png,
    ]);
    const image = `data:image/png;base64,${(await readFile(png)).toString('base64')}`;
    expect(parseCoverArtwork(image)).toBe(image);
    expect(parseCoverArtwork(undefined)).toBeNull();
    expect(() => parseCoverArtwork('data:image/svg+xml,bad')).toThrow();
    const input = library.sources[0],
      asset = { ...(await probeFile(input)), id: 'song', name: 'Song.wav', previewUrl: '' },
      layer = {
        id: 'extra',
        source: sourceIdentity(asset),
        start: 0,
        end: 2,
        sourceStart: 0,
        sourceEnd: 2,
        volume: 0.1,
        muted: false,
        loop: false,
        fadeIn: 0,
        fadeOut: 0,
      },
      edit = {
        ...defaultSettings(asset),
        customArtwork: image,
        audioLayers: [layer],
        includeChapters: true,
        markers: [{ id: 'chapter', name: 'Second verse', time: 0.5, color: 'violet' as const }],
      },
      resources = { ...resourcePaths(join(library.directory, 'recipe')), artwork: png };
    await writeFile(
      resources.chapters,
      serializeChapters([
        { title: 'Opening', start: 0, end: 0.5 },
        { title: 'Second verse', start: 0.5, end: 2 },
      ]),
    );
    for (const format of ['mp3', 'flac', 'm4a'] as const) {
      const output = join(library.directory, `covered.${format}`);
      await exec(
        ffmpegPath(),
        buildExportArgs(asset, { ...edit, format }, input, output, resources, [
          { layer, path: input },
        ]),
      );
      const info = await probeConversion(output),
        cover = info.streams.find(
          (stream: { disposition?: { attached_pic: number } }) =>
            stream.disposition?.attached_pic === 1,
        );
      expect(cover).toMatchObject({ width: 64, height: 64 });
      if (format === 'm4a') expect(info.chapters).toHaveLength(2);
    }
    const plain = join(library.directory, 'plain.mp3');
    await exec(
      ffmpegPath(),
      buildExportArgs(
        asset,
        { ...edit, format: 'mp3', includeArtwork: false },
        input,
        plain,
        resources,
        [{ layer, path: input }],
      ),
    );
    expect(
      (await probeConversion(plain)).streams.every(
        (stream: { codec_type: string }) => stream.codec_type === 'audio',
      ),
    ).toBe(true);
    const clips = [
        { asset, edit },
        { asset, edit },
      ],
      captions = join(library.directory, 'merge.srt');
    await writeFile(captions, '');
    await writeFile(`${captions}-chapters.ffmetadata`, serializeChapters(mergedChapters(clips)));
    const merged = join(library.directory, 'merged.m4a');
    await exec(
      ffmpegPath(),
      buildMergeArgs(
        clips,
        { ...outputSettings(edit), format: 'm4a' },
        [input, input],
        merged,
        undefined,
        [resources, resources],
        captions,
        [[{ layer, path: input }], [{ layer, path: input }]],
      ),
    );
    expect(
      (await probeConversion(merged)).streams.some(
        (stream: { disposition?: { attached_pic: number } }) =>
          stream.disposition?.attached_pic === 1,
      ),
    ).toBe(true);
    const project = createProject('Cover', [asset], () => edit, asset.id);
    expect(parseProject(JSON.parse(JSON.stringify(project))).sources[0].edit.customArtwork).toBe(
      image,
    );
    expect(outputSettings(edit)).not.toHaveProperty('customArtwork');
  } finally {
    await rm(library.directory, { recursive: true, force: true });
  }
});
