import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegPath } from '../electron/native';
import ffprobe from '@ffprobe-installer/ffprobe';
import { buildMergeArgs, compositionAsset } from '../src/core/composition';
import { defaultSettings, type MediaAsset } from '../src/core/types';
import { outputSettings } from '../src/core/presets';
const ffmpeg = ffmpegPath();
const exec = promisify(execFile);
it('merges ordered real clips, normalizes frames, and supplies missing audio', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-merge-'));
  try {
    const red = join(directory, 'red.mp4'); const blue = join(directory, 'blue.mp4'); const output = join(directory, 'merged.mp4');
    await exec(ffmpeg!, ['-y', '-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=30:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'libx264', '-threads', '2', '-c:a', 'aac', red]);
    await exec(ffmpeg!, ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=30:d=1', '-c:v', 'libx264', '-threads', '2', blue]);
    const first: MediaAsset = { id: 'red', name: 'red.mp4', size: 1, kind: 'video', duration: 1, hasAudio: true, width: 320, height: 180, previewUrl: '' };
    const second = { ...first, id: 'blue', hasAudio: false, width: 160, height: 90 };
    const clips = [{ asset: first, edit: { ...defaultSettings(first), start: 0.2, end: 0.7, crop: { x: 0, y: 0, width: 160, height: 100 } } }, { asset: second, edit: { ...defaultSettings(second), start: 0.4, end: 0.9 } }];
    expect(compositionAsset(clips).duration).toBeCloseTo(1);
    await exec(ffmpeg!, buildMergeArgs(clips, outputSettings(defaultSettings(first)), [red, blue], output));
    const { stdout } = await exec(ffprobe.path, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output]);
    const info = JSON.parse(stdout); expect(Number(info.format.duration)).toBeCloseTo(1, 1);
    expect(info.streams[0].width).toBe(160); expect(info.streams[0].height).toBe(100); expect(info.streams.some((s: { codec_type: string }) => s.codec_type === 'audio')).toBe(true);
    for (const [time, channel] of [[0.1, 0], [0.7, 2]]) {
      const { stdout: pixel } = await exec(ffmpeg!, ['-v', 'error', '-ss', String(time), '-i', output, '-vf', 'scale=1:1', '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { encoding: 'buffer' });
      expect(pixel[channel]).toBeGreaterThan(200);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
it('rejects video output containing audio-only clips', () => {
  const asset: MediaAsset = { id: 'audio', name: 'tone.wav', size: 1, kind: 'audio', duration: 1, hasAudio: true, previewUrl: '' };
  const clips = Array.from({ length: 2 }, () => ({ asset, edit: defaultSettings(asset) }));
  expect(() => buildMergeArgs(clips, { ...outputSettings(defaultSettings(asset)), format: 'mp4' }, ['a', 'b'], 'out')).toThrow('Audio cannot');
});
it('merges trimmed audio sources and retains first-source artwork by default', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-audio-merge-'));
  try {
    const cover = join(directory, 'cover.jpg'); const input = join(directory, 'audio.mp3');
    await exec(ffmpeg!, ['-y', '-f', 'lavfi', '-i', 'color=green:s=32x32', '-frames:v', '1', '-threads', '1', cover]);
    await exec(ffmpeg!, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-i', cover, '-map', '0:a', '-map', '1:v', '-c:a', 'libmp3lame', '-c:v', 'copy', '-disposition:v', 'attached_pic', input]);
    const { probeFile } = await import('../electron/native');
    const asset: MediaAsset = { ...await probeFile(input), id: 'audio', name: 'audio.mp3', previewUrl: '' };
    const clips = Array.from({ length: 2 }, () => ({ asset, edit: { ...defaultSettings(asset), start: 1, end: 1.5 } }));
    for (const includeArtwork of [true, false]) {
      const output = join(directory, `merged-${includeArtwork}.flac`);
      await exec(ffmpeg!, buildMergeArgs(clips, { ...outputSettings(defaultSettings(asset)), format: 'flac', includeArtwork }, [input, input], output));
      const { stdout } = await exec(ffprobe.path, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output]);
      const info = JSON.parse(stdout); expect(Number(info.format.duration)).toBeCloseTo(1, 1);
      expect(info.streams.some((s: { disposition?: { attached_pic?: number } }) => s.disposition?.attached_pic === 1)).toBe(includeArtwork);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
