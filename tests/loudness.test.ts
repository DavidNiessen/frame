import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegPath, probeFile } from '../electron/native';
import { loudnessArgs, LoudnessCollector } from '../src/core/loudness';
import { defaultSettings } from '../src/core/types';
const exec = promisify(execFile);
it('measures actual edited gain and peaks, including ordered clip effects', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-meter-'));
  try {
    const source = join(directory, 'tone.wav'); await exec(ffmpegPath(), ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-af', 'volume=7', '-c:a', 'pcm_f32le', source]);
    const asset = { ...await probeFile(source), id: 'a', name: 'tone.wav', previewUrl: '' };
    async function measure(gain: number, ordered = false) {
      const settings = { ...defaultSettings(asset), volume: gain, ...(ordered ? { clips: [{ id: 'late', start: 1.5, end: 3, effects: { volume: gain } }, { id: 'early', start: 0, end: 1.5, effects: { volume: gain } }] } : {}) };
      const collector = new LoudnessCollector(), { stderr } = await exec(ffmpegPath(), loudnessArgs(asset, settings, source)); stderr.split('\n').forEach(line => collector.push(line)); return collector.finish();
    }
    const original = await measure(1), boosted = await measure(2, true); expect(boosted.truePeak!).toBeGreaterThan(0); expect(boosted.truePeak! - original.truePeak!).toBeCloseTo(6, 0); expect(boosted.integrated! - original.integrated!).toBeCloseTo(6, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
it('reports silent measurements without presenting infinity as a numeric reading', () => { const collector = new LoudnessCollector(); for (const line of [' I: -70.0 LUFS', ' LRA: 0.0 LU', ' Peak: -inf dBFS']) collector.push(line); expect(collector.finish()).toEqual({ integrated: null, range: 0, truePeak: null }); });
