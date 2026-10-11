import { expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sourceFingerprint } from '../src/core/source-fingerprint';
import { nativeSourceFingerprint } from '../electron/source-fingerprint';
import { createProject, matchSources, parseProject, sourceIdentity } from '../src/core/project';
import { audioLayerSource, resolveAudioLayers } from '../src/core/audio-layers';
import { defaultSettings, type MediaAsset } from '../src/core/types';
it('matches browser/native sampled fingerprints and disambiguates portable same-name sources', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-source-fingerprint-'));
  try {
    for (const size of [3, 65536, 75000, 180000]) {
      const bytes = Uint8Array.from({ length: size }, (_, index) => index % 251),
        path = join(directory, `source-${size}`);
      await writeFile(path, bytes);
      expect(await nativeSourceFingerprint(path, size)).toBe(
        await sourceFingerprint(new Blob([bytes])),
      );
    }
    const common: MediaAsset = {
        id: 'first',
        name: 'Song.wav',
        size: 180000,
        duration: 2,
        hasAudio: true,
        kind: 'audio',
        previewUrl: '',
      },
      first = { ...common, fingerprint: 'a'.repeat(64) },
      second = { ...common, id: 'second', fingerprint: 'b'.repeat(64) };
    const layer = {
        id: 'track',
        sourceId: 'second',
        source: sourceIdentity(second),
        start: 0,
        end: 2,
        sourceStart: 0,
        sourceEnd: 2,
        loop: false,
        muted: false,
        volume: 1,
        fadeIn: 0,
        fadeOut: 0,
      },
      edit = { ...defaultSettings(first), audioLayers: [layer] };
    expect(audioLayerSource(layer, [first, second])).toBe(second);
    expect(
      resolveAudioLayers(edit, [
        { asset: first, path: 'first' },
        { asset: second, path: 'second' },
      ])[0].path,
    ).toBe('second');
    const project = createProject(
        'Same filenames',
        [first, second],
        (id) => (id === 'first' ? edit : defaultSettings(second)),
        'first',
      ),
      portable = project.sources[0].edit.audioLayers![0];
    expect(portable.sourceIndex).toBe(1);
    expect(portable.sourceId).toBeUndefined();
    const moved = [
      { ...second, id: 'new-second' },
      { ...first, id: 'new-first' },
    ];
    expect(matchSources(project, moved)).toEqual(['new-first', 'new-second']);
    expect(() =>
      parseProject({
        ...project,
        sources: [
          {
            ...project.sources[0],
            edit: { ...edit, audioLayers: [{ ...portable, sourceIndex: 9 }] },
          },
          project.sources[1],
        ],
      }),
    ).toThrow('missing');
    const identical = { ...first, id: 'copy' },
      copyLayer = { ...layer, sourceId: 'copy', source: sourceIdentity(first) };
    expect(audioLayerSource(copyLayer, [first, identical])).toBe(identical);
    expect(
      audioLayerSource({ ...copyLayer, sourceId: undefined }, [first, identical]),
    ).toBeUndefined();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
