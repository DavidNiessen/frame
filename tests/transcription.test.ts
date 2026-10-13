import { expect, it } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  speechSamples,
  transcriptionCues,
  addTranscription,
  parseTranscriptionOptions,
} from '../src/core/transcription';
import { analysisDataArgs } from '../src/core/analysis-data';
import { defaultSettings, type MediaAsset } from '../src/core/types';
import { captionItems } from '../src/core/caption-items';
import { ffmpegPath, probeFile, runFfmpeg } from '../electron/native';
import { resourcePaths } from '../src/core/resources';
import { createProject, parseProject } from '../src/core/project';
const exec = promisify(execFile);
const asset: MediaAsset = {
  id: 'video',
  name: 'speech.mp4',
  kind: 'video',
  duration: 20,
  size: 100,
  hasAudio: true,
  previewUrl: '',
  width: 160,
  height: 90,
};
it('creates individual output-time captions without duplicating existing captions or losing timing through cuts', () => {
  const edit = defaultSettings(asset);
  edit.start = 5;
  edit.end = 15;
  edit.cuts = [{ start: 7, end: 9 }];
  const cues = transcriptionCues(
    [
      { text: ' Hello world. ', timestamp: [0, 2] },
      { text: ' Next sentence.', timestamp: [3, null] },
    ],
    1,
    5,
  );
  const updated = { ...edit, ...addTranscription(edit, cues) };
  expect(captionItems(updated).map((c) => [c.start, c.end, c.text, c.timeSpace])).toEqual([
    [1, 3, 'Hello world.', 'output'],
    [4, 6, 'Next sentence.', 'output'],
  ]);
  expect(
    parseProject(createProject('Speech', [asset], () => updated, asset.id)).sources[0].edit
      .effectInstances,
  ).toHaveLength(2);
  expect(
    addTranscription(updated, [{ start: 1, end: 2, text: 'Another' }]).effectInstances,
  ).toHaveLength(3);
  expect(() => parseTranscriptionOptions({ start: 0, end: 9, language: 'auto' }, edit)).toThrow();
});
it('extracts trimmed mixed speech to bounded mono PCM suitable for local inference', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-speech-audio-'));
  try {
    const input = join(directory, 'tone.wav'),
      output = join(directory, 'speech.wav');
    await exec(ffmpegPath(), [
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=4',
      input,
    ]);
    const source = { ...(await probeFile(input)), id: 'tone', name: 'tone.wav', previewUrl: '' },
      edit = defaultSettings(source);
    edit.cuts = [{ start: 1, end: 2 }];
    await runFfmpeg(
      analysisDataArgs(
        source,
        edit,
        { kind: 'speech', start: 0.5, end: 2.5 },
        input,
        output,
        resourcePaths(),
      ),
      2,
      () => {},
    ).done;
    const samples = speechSamples(new Uint8Array(await readFile(output)));
    expect(samples.length).toBe(32000);
    expect(samples.some((v) => Math.abs(v) > 0.05)).toBe(true);
    expect(() => speechSamples(new Uint8Array(44))).toThrow();
    await writeFile(output, new Uint8Array(8));
    expect(() => speechSamples(new Uint8Array(8))).toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
