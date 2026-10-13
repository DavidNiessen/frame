import { beforeAll, afterAll, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { defaultSettings, type MediaAsset } from '../src/core/types';
import { ffmpegPath, probeFile } from '../electron/native';
import {
  insertedMediaLayer,
  parseMediaLayers,
  changeMediaLayer,
  splitMediaLayer,
  removeMediaLayer,
  resizeMediaLayer,
} from '../src/core/media-layers';
import { defaultVisual } from '../src/core/visual-settings';
import { resourcePaths } from '../src/core/resources';
import { buildExportArgs } from '../src/core/export-plan';
import { createProject, parseProject } from '../src/core/project';
import { recoveredEdits } from '../src/core/workspace-recovery';
import { insertedAudioLayer } from '../src/core/media-insertion';
import { editClips, splitClip } from '../src/core/clips';
import { pasteTimeline } from '../src/core/timeline-clipboard';
import { sourceIdentity } from '../src/core/project';
const exec = promisify(execFile);
let dir: string,
  base: MediaAsset,
  video: MediaAsset,
  picture: MediaAsset,
  input: string,
  videoPath: string,
  picturePath: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'frame-media-layers-'));
  input = join(dir, 'base.mp4');
  videoPath = join(dir, 'red.mp4');
  picturePath = join(dir, 'photo.png');
  await exec(ffmpegPath(), [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=blue:size=64x48:rate=10',
    '-t',
    '6',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    input,
  ]);
  await exec(ffmpegPath(), [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=red:size=64x48:rate=10',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=2',
    '-t',
    '2',
    '-c:v',
    'libx264',
    '-c:a',
    'aac',
    '-pix_fmt',
    'yuv420p',
    videoPath,
  ]);
  await exec(ffmpegPath(), [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=green:size=64x48',
    '-frames:v',
    '1',
    '-threads',
    '1',
    picturePath,
  ]);
  base = { ...(await probeFile(input)), id: 'base', name: 'base.mp4', previewUrl: '' };
  video = { ...(await probeFile(videoPath)), id: 'video', name: 'red.mp4', previewUrl: '' };
  picture = { ...(await probeFile(picturePath)), id: 'photo', name: 'photo.png', previewUrl: '' };
});
afterAll(async () => rm(dir, { recursive: true, force: true }));
async function frame(path: string, at: number) {
  return (
    await exec(
      ffmpegPath(),
      [
        '-v',
        'error',
        '-ss',
        String(at),
        '-i',
        path,
        '-frames:v',
        '1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        '-threads',
        '1',
        '-',
      ],
      { encoding: 'buffer' },
    )
  ).stdout;
}
it('renders independently timed video and image tracks, layer appearance and real source audio', async () => {
  const edit = defaultSettings(base),
    layer = { ...insertedMediaLayer(edit, base, video, 1), x: 0, y: 0, width: 50, height: 50 },
    image = {
      ...insertedMediaLayer(edit, base, picture, 3),
      start: 3,
      end: 5,
      x: 50,
      y: 50,
      width: 50,
      height: 50,
      visual: { ...defaultVisual(), grayscale: 1 },
    },
    audio = { ...insertedAudioLayer(edit, video, 1), role: undefined };
  layer.audioLayerId = audio.id;
  edit.mediaLayers = [layer, image];
  edit.audioLayers = [audio];
  const paths = { ...resourcePaths(), media: { [layer.id]: videoPath, [image.id]: picturePath } },
    output = join(dir, 'layers.mp4');
  await exec(
    ffmpegPath(),
    buildExportArgs(base, edit, input, output, paths, [{ layer: audio, path: videoPath }]),
  );
  const before = await frame(output, 0.5),
    during = await frame(output, 1.5),
    after = await frame(output, 4);
  expect(before[2]).toBeGreaterThan(200);
  expect(during[0]).toBeGreaterThan(200);
  expect(during[2]).toBeLessThan(60);
  const index = (36 * 64 + 48) * 3;
  expect(Math.abs(after[index] - after[index + 1])).toBeLessThan(5);
  expect((await probeFile(output)).hasAudio).toBe(true);
});
it('keeps visual tracks on output time across discarded base splits', async () => {
  let edit = defaultSettings(base);
  edit = { ...edit, ...splitClip(edit, editClips(edit)[0].id, 2) };
  edit.clips = edit.clips!.filter((_, i) => i === 1);
  const layer = {
    ...insertedMediaLayer(edit, base, video, edit.start),
    start: 0.5,
    end: 2.5,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  };
  edit.mediaLayers = [layer];
  const out = join(dir, 'split-layers.mp4');
  await exec(
    ffmpegPath(),
    buildExportArgs(base, edit, input, out, {
      ...resourcePaths(),
      media: { [layer.id]: videoPath },
    }),
  );
  expect((await frame(out, 0.2))[2]).toBeGreaterThan(200);
  expect((await frame(out, 1))[0]).toBeGreaterThan(200);
});
it('composes imported pictures in image projects and retains portable source references', async () => {
  const asset = { ...picture, id: 'image', name: 'base.png' },
    edit = defaultSettings(asset),
    layer = {
      ...insertedMediaLayer(edit, asset, picture, 0),
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      opacity: 0.5,
    };
  edit.mediaLayers = [layer];
  const output = join(dir, 'composite.png');
  await exec(
    ffmpegPath(),
    buildExportArgs(asset, edit, picturePath, output, {
      ...resourcePaths(),
      media: { [layer.id]: picturePath },
    }),
  );
  expect((await probeFile(output)).width).toBe(64);
  const project = createProject(
      'Layers',
      [base, video, picture],
      (id) =>
        id === base.id
          ? {
              ...defaultSettings(base),
              mediaLayers: [
                {
                  ...layer,
                  source: sourceIdentity(picture),
                  sourceId: picture.id,
                  start: 0,
                  end: 4,
                },
              ],
            }
          : defaultSettings(id === video.id ? video : picture),
      base.id,
    ),
    portable = parseProject(project);
  expect(portable.sources[0].edit.mediaLayers?.[0].sourceId).toBeUndefined();
  expect(portable.sources[0].edit.mediaLayers?.[0].sourceIndex).toBe(2);
  const assets = [
      { ...base, id: 'new-base' },
      { ...video, id: 'new-video' },
      { ...picture, id: 'new-photo' },
    ],
    recovered = recoveredEdits({
      document: { version: 1, savedAt: Date.now(), project },
      assets,
      sourceIds: assets.map((a) => a.id),
      issues: [],
    });
  expect(recovered.entries[0].edit.mediaLayers?.[0].sourceId).toBe('new-photo');
});
it('trims, expands, moves and splits linked picture/audio while keeping independent IDs', () => {
  const edit = defaultSettings(base),
    layer = insertedMediaLayer(edit, base, video, 1),
    audio = insertedAudioLayer(edit, video, 1);
  layer.audioLayerId = audio.id;
  edit.mediaLayers = [layer];
  edit.audioLayers = [audio];
  const trimmed = { ...edit, ...resizeMediaLayer(edit, layer, { start: 1.4, end: 2.8 }) },
    expanded = {
      ...trimmed,
      ...resizeMediaLayer(trimmed, trimmed.mediaLayers![0], { start: 1.4, end: 3 }),
    };
  expect(expanded.mediaLayers![0].sourceEnd).toBeCloseTo(2);
  expect(expanded.audioLayers![0].sourceStart).toBeCloseTo(0.4);
  const moved = { ...expanded, ...changeMediaLayer(expanded, layer.id, { start: 2, end: 3.6 }) };
  expect(moved.audioLayers![0].start).toBe(2);
  const split = { ...moved, ...splitMediaLayer(moved, layer.id, 2.8) };
  expect(split.mediaLayers).toHaveLength(2);
  expect(split.audioLayers).toHaveLength(2);
  expect(split.mediaLayers![1].audioLayerId).not.toBe(audio.id);
  const removed = { ...split, ...removeMediaLayer(split, layer.id) };
  expect(removed.audioLayers).toHaveLength(1);
  const pasted = pasteTimeline(
    { kind: 'visual', layer: removed.mediaLayers![0] },
    removed,
    base,
    0.3,
  );
  expect(pasted.patch.mediaLayers).toHaveLength(2);
  expect(pasted.patch.mediaLayers![1].id).not.toBe(removed.mediaLayers![0].id);
});
it('rejects invalid sources, geometry and timing', () => {
  const layer = insertedMediaLayer(defaultSettings(base), base, video, 0);
  expect(() => parseMediaLayers([{ ...layer, width: NaN }])).toThrow();
  expect(() => parseMediaLayers([{ ...layer, end: 10 }])).toThrow();
  expect(() =>
    parseMediaLayers([{ ...layer, source: { ...layer.source, kind: 'audio' } }]),
  ).toThrow();
});
