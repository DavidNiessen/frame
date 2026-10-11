import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegPath } from '../electron/native';
import ffprobe from '@ffprobe-installer/ffprobe';
import { buildExportArgs } from '../src/core/export-plan';
import { buildMergeArgs } from '../src/core/composition';
import { outputSettings } from '../src/core/presets';
import { fadeGain, outputTimeAtSource } from '../src/core/fades';
import { defaultSettings, type MediaAsset } from '../src/core/types';
const ffmpeg = ffmpegPath();
const exec = promisify(execFile);
it('fades edited audio at its output boundaries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-fades-'));
  try {
    const input = join(directory, 'tone.wav');
    const output = join(directory, 'faded.wav');
    await exec(ffmpeg!, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', input]);
    const asset: MediaAsset = {
      id: 'tone',
      name: 'tone.wav',
      size: 1,
      kind: 'audio',
      hasAudio: true,
      duration: 2,
      previewUrl: '',
    };
    const edit = {
      ...defaultSettings(asset),
      format: 'wav' as const,
      cuts: [{ start: 0.75, end: 1.25 }],
      audioFadeIn: 0.5,
      audioFadeOut: 0.5,
    };
    await exec(ffmpeg!, buildExportArgs(asset, edit, input, output));
    const { stdout: pcm } = await exec(
      ffmpeg!,
      ['-v', 'error', '-i', output, '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'],
      { encoding: 'buffer' },
    );
    const rms = (start: number, end: number) => {
      let sum = 0;
      let count = 0;
      for (let i = Math.floor(start * 48000); i < Math.floor(end * 48000); i++) {
        sum += pcm.readFloatLE(i * 4) ** 2;
        count++;
      }
      return Math.sqrt(sum / count);
    };
    expect(rms(0, 0.05) / rms(0.6, 0.7)).toBeLessThan(0.15);
    expect(rms(1.45, 1.5) / rms(0.6, 0.7)).toBeLessThan(0.15);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
it('crossfades real frames and reduces composition duration by the overlap', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-crossfade-'));
  try {
    const inputs = [join(directory, 'red.mp4'), join(directory, 'blue.mp4')];
    const output = join(directory, 'merged.mp4');
    for (const [i, color] of ['red', 'blue'].entries())
      await exec(ffmpeg!, [
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=${color}:s=160x90:r=30:d=1`,
        '-c:v',
        'libx264',
        '-threads',
        '2',
        inputs[i],
      ]);
    const asset: MediaAsset = {
      id: 'video',
      name: 'color.mp4',
      size: 1,
      kind: 'video',
      hasAudio: false,
      duration: 1,
      width: 160,
      height: 90,
      previewUrl: '',
    };
    const clips = inputs.map(() => ({ asset, edit: defaultSettings(asset) }));
    await exec(
      ffmpeg!,
      buildMergeArgs(clips, outputSettings(defaultSettings(asset)), inputs, output, {
        type: 'fade',
        duration: 0.3,
      }),
    );
    const { stdout } = await exec(ffprobe.path, [
      '-v',
      'error',
      '-show_format',
      '-of',
      'json',
      output,
    ]);
    expect(Number(JSON.parse(stdout).format.duration)).toBeCloseTo(1.7, 1);
    const { stdout: pixel } = await exec(
      ffmpeg!,
      [
        '-v',
        'error',
        '-ss',
        '0.85',
        '-i',
        output,
        '-vf',
        'scale=1:1',
        '-frames:v',
        '1',
        '-pix_fmt',
        'rgb24',
        '-f',
        'rawvideo',
        '-',
      ],
      { encoding: 'buffer' },
    );
    expect(pixel[0]).toBeGreaterThan(80);
    expect(pixel[2]).toBeGreaterThan(80);
    expect(pixel[0]).toBeLessThan(180);
    expect(pixel[2]).toBeLessThan(180);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
it('maps source time through cuts and speed for preview fades', () => {
  const asset: MediaAsset = {
    id: '',
    name: '',
    size: 1,
    kind: 'audio',
    hasAudio: true,
    duration: 2,
    previewUrl: '',
  };
  expect(
    outputTimeAtSource(
      { ...defaultSettings(asset), speed: 2, cuts: [{ start: 0.5, end: 1 }] },
      1.5,
    ),
  ).toBe(0.5);
  expect(fadeGain(0.5, 1, 1, 1)).toBe(0.25);
});
