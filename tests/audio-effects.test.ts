import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegPath } from '../electron/native';
import { buildExportArgs } from '../src/core/export-plan';
import { defaultSettings, type MediaAsset } from '../src/core/types';
const ffmpeg = ffmpegPath();
const exec = promisify(execFile);
const asset: MediaAsset = {
  id: 'tone',
  name: 'tone.wav',
  size: 1,
  kind: 'audio',
  hasAudio: true,
  duration: 3,
  previewUrl: '',
};
const rms = (buffer: Buffer) => {
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 4) sum += buffer.readFloatLE(i) ** 2;
  return Math.sqrt(sum / (buffer.length / 4));
};
const pcm = async (path: string) =>
  (
    await exec(
      ffmpeg!,
      ['-v', 'error', '-i', path, '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'],
      { encoding: 'buffer', maxBuffer: 4_000_000 },
    )
  ).stdout;
it('normalizes actual integrated loudness and preserves final volume gain', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-loudness-'));
  try {
    const input = join(directory, 'quiet.wav');
    const output = join(directory, 'normal.wav');
    const quiet = join(directory, 'quieter.wav');
    await exec(ffmpeg!, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=3',
      '-af',
      'volume=0.1',
      input,
    ]);
    const edit = {
      ...defaultSettings(asset),
      format: 'wav' as const,
      normalizeLoudness: true,
      targetLufs: -16,
    };
    await exec(ffmpeg!, buildExportArgs(asset, edit, input, output));
    const { stderr } = await exec(ffmpeg!, [
      '-i',
      output,
      '-af',
      'loudnorm=I=-16:TP=-1:LRA=11:print_format=json',
      '-f',
      'null',
      '-',
    ]);
    const stats = JSON.parse(stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1));
    expect(Math.abs(Number(stats.input_i) + 16)).toBeLessThan(1);
    await exec(ffmpeg!, buildExportArgs(asset, { ...edit, volume: 0.5 }, input, quiet));
    expect(rms(await pcm(quiet)) / rms(await pcm(output))).toBeCloseTo(0.5, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
it('reduces measured noise energy and applies equalizer gain to the selected band', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-cleanup-'));
  try {
    const noise = join(directory, 'noise.wav');
    const cleaned = join(directory, 'cleaned.wav');
    const tone = join(directory, 'tone.wav');
    const eq = join(directory, 'eq.wav');
    await exec(ffmpeg!, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'anoisesrc=color=white:amplitude=0.03:duration=3:seed=42',
      noise,
    ]);
    await exec(
      ffmpeg!,
      buildExportArgs(
        asset,
        {
          ...defaultSettings(asset),
          format: 'wav',
          reduceNoise: true,
          noiseStrength: 24,
          noiseFloor: -25,
        },
        noise,
        cleaned,
      ),
    );
    expect(rms(await pcm(cleaned)) / rms(await pcm(noise))).toBeLessThan(0.7);
    await exec(ffmpeg!, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=3', tone]);
    await exec(
      ffmpeg!,
      buildExportArgs(
        asset,
        { ...defaultSettings(asset), format: 'wav', equalizer: { bass: 0, mid: 6, treble: 0 } },
        tone,
        eq,
      ),
    );
    expect(rms(await pcm(eq)) / rms(await pcm(tone))).toBeGreaterThan(1.8);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
