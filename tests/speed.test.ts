import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpeg from 'ffmpeg-static';
import ffprobe from '@ffprobe-installer/ffprobe';
import { buildExportArgs, validateEdit } from '../src/core/export-plan';
import { editedDuration } from '../src/core/timeline';
import { parseEdit } from '../src/core/project';
import { defaultSettings, type MediaAsset } from '../src/core/types';
const exec = promisify(execFile);
const audio: MediaAsset = { id: 'audio', name: 'tone.wav', size: 1, kind: 'audio', duration: 2, hasAudio: true, previewUrl: '' };
it('exports real speed changes with predictable duration and optional pitch preservation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-speed-'));
  try {
    const input = join(directory, 'tone.wav'); await exec(ffmpeg!, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', input]);
    for (const [speed, preservePitch] of [[0.25, true], [2, true], [2, false]] as const) {
      const output = join(directory, `${speed}-${preservePitch}.wav`); const edit = { ...defaultSettings(audio), format: 'wav' as const, speed, preservePitch };
      await exec(ffmpeg!, buildExportArgs(audio, edit, input, output));
      const { stdout } = await exec(ffprobe.path, ['-v', 'error', '-show_format', '-of', 'json', output]);
      expect(Number(JSON.parse(stdout).format.duration)).toBeCloseTo(2 / speed, 1);
      const { stdout: pcm } = await exec(ffmpeg!, ['-v', 'error', '-i', output, '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { encoding: 'buffer', maxBuffer: 4_000_000 });
      const start = Math.floor(pcm.length / 4 * 0.25); const end = Math.floor(pcm.length / 4 * 0.75); let crossings = 0;
      for (let i = start + 1; i < end; i++) if (pcm.readFloatLE((i - 1) * 4) < 0 && pcm.readFloatLE(i * 4) >= 0) crossings++;
      const frequency = crossings / ((end - start) / 48000); expect(Math.abs(frequency - (preservePitch ? 440 : 440 * speed))).toBeLessThan(5);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
it('migrates legacy recipes and rejects invalid speeds', () => {
  const legacy: Record<string, unknown> = { ...defaultSettings(audio) }; delete legacy.speed; delete legacy.preservePitch;
  expect(parseEdit(legacy, audio)).toMatchObject({ speed: 1, preservePitch: true });
  for (const speed of [0, 0.1, 5, NaN]) expect(() => validateEdit(audio, { ...defaultSettings(audio), speed })).toThrow();
  expect(editedDuration({ ...defaultSettings(audio), speed: 2, cuts: [{ start: 0.5, end: 1 }] })).toBe(0.75);
});
