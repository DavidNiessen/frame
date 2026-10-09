import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegPath } from '../electron/native';
import { estimateSize, resolveSizeTarget } from '../src/core/size';
import { defaultSettings, type MediaAsset } from '../src/core/types';
import { buildExportArgs } from '../src/core/export-plan';
const ffmpeg = ffmpegPath();
const exec = promisify(execFile);
const asset: MediaAsset = { id: 'tone', name: 'tone.wav', size: 1, duration: 6, kind: 'audio', hasAudio: true, audioSampleRate: 48000, audioChannels: 1, previewUrl: '' };
it('uses edited duration for budget and rejects impossible targets', () => {
  const edit = { ...defaultSettings(asset), targetSizeMb: .1, speed: 2 };
  expect(resolveSizeTarget(asset, edit).audioBitrate).toBe(253);
  expect(() => resolveSizeTarget({ ...asset, duration: 60 }, { ...edit, end: 60, speed: 1 })).toThrow('too small');
  expect(estimateSize(asset, { ...edit, format: 'gif' })).toBeNull();
});
it('predicts PCM bytes and exports actual target-bitrate audio', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-size-'));
  try {
    const input = join(directory, 'tone.wav'), output = join(directory, 'target.mp3');
    await exec(ffmpeg!, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6:sample_rate=48000', input]);
    const pcm = estimateSize(asset, { ...defaultSettings(asset), format: 'wav' })!; const inputSize = (await stat(input)).size; expect(inputSize).toBeGreaterThanOrEqual(pcm.low); expect(inputSize).toBeLessThan(pcm.high);
    await exec(ffmpeg!, buildExportArgs(asset, { ...defaultSettings(asset), targetSizeMb: .1 }, input, output)); const size = (await stat(output)).size; expect(size).toBeGreaterThan(80000); expect(size).toBeLessThan(110000);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
