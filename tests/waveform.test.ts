import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegPath } from '../electron/native';
import { waveformArgs, waveformPath, WaveformCollector } from '../src/core/waveform';
import type { MediaAsset } from '../src/core/types';
const ffmpeg = ffmpegPath();
const exec = promisify(execFile);
it('clips partial peak windows and keeps the source shape in independently trimmed sections', () => {
  const points = [
    { time: 0, peak: 1 },
    { time: 1, peak: 0.5 },
    { time: 2, peak: 0 },
    { time: 3, peak: 0.25 },
  ];
  const bars = (start: number, end: number) =>
    [
      ...waveformPath(points, 4, { start, end }).matchAll(/M([\d.e+-]+),([\d.e+-]+)h([\d.e+-]+)/g),
    ].map((m) => ({ x: Number(m[1]), top: Number(m[2]), width: Number(m[3]) }));
  expect(bars(0.5, 1.5)).toEqual([
    { x: 0, top: 4, width: 500 },
    { x: 500, top: 27, width: 500 },
  ]);
  expect(bars(2, 3)).toEqual([{ x: 0, top: 49.2, width: 1000 }]);
  expect(bars(3, 4)).toEqual([{ x: 0, top: 38.5, width: 1000 }]);
  expect(waveformPath(points, 4, { start: 3, end: 3 })).toBe('');
});
it('measures audible peaks and quiet windows in real audio', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-wave-'));
  try {
    const input = join(directory, 'tone.wav');
    await exec(ffmpeg!, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=2',
      '-af',
      "volume=enable='gte(t,1)':volume=0",
      input,
    ]);
    const asset: MediaAsset = {
      id: '',
      name: 'tone.wav',
      size: 1,
      kind: 'audio',
      hasAudio: true,
      duration: 2,
      previewUrl: '',
    };
    const { stderr } = await exec(ffmpeg!, waveformArgs(asset, input), { maxBuffer: 2_000_000 });
    const collector = new WaveformCollector();
    collector.push(stderr);
    expect(collector.points.length).toBeGreaterThan(20);
    expect(collector.points.length).toBeLessThanOrEqual(1024);
    expect(
      Math.max(...collector.points.filter((p) => p.time < 0.9).map((p) => p.peak)),
    ).toBeGreaterThan(0.1);
    expect(Math.max(...collector.points.filter((p) => p.time > 1.1).map((p) => p.peak))).toBe(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
