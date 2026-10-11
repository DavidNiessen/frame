import { afterAll, beforeAll, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { appendVideoArgs, extractAudioArgs, sequenceOffset } from '../src/core/media-preparation';
import { ffmpegPath, ffprobePath, probeFile } from '../electron/native';
import type { MediaAsset } from '../src/core/types';
const exec = promisify(execFile),
  input = resolve('tests/fixtures/sample.mp4');
let directory: string, asset: MediaAsset;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'frame-preparation-test-'));
  asset = { ...(await probeFile(input)), id: 'source', name: 'sample.mp4', previewUrl: '' };
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});
it('extracts an audio-only FLAC file with the original length and decoded sound level', async () => {
  const output = join(directory, 'extracted.flac');
  await exec(ffmpegPath(), extractAudioArgs(asset, input, output), {
    env: { ...process.env, PATH: '' },
  });
  const audio = await probeFile(output);
  expect(audio.kind).toBe('audio');
  expect(audio.audioCodec).toBe('flac');
  expect(audio.duration).toBeCloseTo(asset.duration, 1);
  const pcm = async (path: string) =>
    (
      await exec(
        ffmpegPath(),
        ['-v', 'error', '-i', path, '-map', '0:a:0', '-t', '1', '-f', 'f32le', '-'],
        { encoding: 'buffer', maxBuffer: 2_000_000 },
      )
    ).stdout;
  const rms = (data: Buffer) => {
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data.readFloatLE(i) ** 2;
    return Math.sqrt(sum / (data.length / 4));
  };
  expect(rms(await pcm(output)) / rms(await pcm(input))).toBeCloseTo(1, 4);
  expect((await probeFile(input)).fingerprint).toBe(asset.fingerprint);
  expect(() => extractAudioArgs({ ...asset, hasAudio: false }, input, output)).toThrow(
    'audio stream',
  );
});
it('prepares a continuous sequence from silent and audible sources with different dimensions', async () => {
  const otherPath = join(directory, 'other.mp4'),
    output = join(directory, 'sequence.mp4');
  await exec(ffmpegPath(), [
    '-y',
    '-i',
    input,
    '-t',
    '2',
    '-vf',
    'scale=320:180',
    '-an',
    '-threads',
    '2',
    otherPath,
  ]);
  const other = { ...(await probeFile(otherPath)), id: 'other', name: 'other.mp4', previewUrl: '' };
  await exec(ffmpegPath(), appendVideoArgs(other, asset, [otherPath, input], output), {
    env: { ...process.env, PATH: '' },
  });
  const prepared = await probeFile(output);
  expect(prepared.duration).toBeCloseTo(8, 1);
  expect(prepared.width).toBe(320);
  expect(prepared.height).toBe(180);
  expect(prepared.hasAudio).toBe(true);
  const { stdout } = await exec(ffprobePath(), [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'frame=best_effort_timestamp_time',
    '-of',
    'csv=p=0',
    output,
  ]);
  const times = stdout
    .split('\n')
    .map((line) => Number(line.replace(/,$/, '')))
    .filter(Number.isFinite);
  expect(times.some((time) => Math.abs(time - sequenceOffset(other)) < 0.001)).toBe(true);
  expect(() =>
    appendVideoArgs({ ...asset, kind: 'audio' }, other, [input, otherPath], output),
  ).toThrow('video sources');
});
