import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { waveformArgs, WaveformCollector } from '../src/core/waveform';
import type { MediaAsset } from '../src/core/types';
const exec = promisify(execFile);
it('measures audible peaks and quiet windows in real audio', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-wave-'));
  try {
    const input = join(directory, 'tone.wav');
    await exec(ffmpeg!, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-af', "volume=enable='gte(t,1)':volume=0", input]);
    const asset: MediaAsset = { id: '', name: 'tone.wav', size: 1, kind: 'audio', hasAudio: true, duration: 2, previewUrl: '' };
    const { stderr } = await exec(ffmpeg!, waveformArgs(asset, input), { maxBuffer: 2_000_000 });
    const collector = new WaveformCollector(); collector.push(stderr);
    expect(collector.points.length).toBeGreaterThan(20); expect(collector.points.length).toBeLessThanOrEqual(1024);
    expect(Math.max(...collector.points.filter(p => p.time < 0.9).map(p => p.peak))).toBeGreaterThan(0.1);
    expect(Math.max(...collector.points.filter(p => p.time > 1.1).map(p => p.peak))).toBe(0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
