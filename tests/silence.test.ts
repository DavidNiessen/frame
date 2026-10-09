import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegPath } from '../electron/native';
import { applySilenceCuts, defaultSilence, silenceArgs, silenceCandidates, SilenceCollector } from '../src/core/silence';
import { defaultSettings, type MediaAsset } from '../src/core/types';
import { editedDuration } from '../src/core/timeline';
const ffmpeg = ffmpegPath();
const exec = promisify(execFile);
it('detects real silence, retains padding, and applies only reviewed cuts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-silence-'));
  try {
    const input = join(directory, 'quiet.wav');
    await exec(ffmpeg!, ['-y', '-f', 'lavfi', '-i', "aevalsrc=if(between(t\\,1\\,2)\\,0\\,0.1*sin(2*PI*440*t)):d=3:s=48000", input]);
    const asset: MediaAsset = { id: 'quiet', name: 'quiet.wav', size: 1, duration: 3, kind: 'audio', hasAudio: true, previewUrl: '' };
    const { stderr } = await exec(ffmpeg!, silenceArgs(asset, input, defaultSilence)); const collector = new SilenceCollector(); stderr.split('\n').forEach(l => collector.push(l));
    const edit = defaultSettings(asset), found = silenceCandidates(collector.finish(3), edit, .1); expect(found).toHaveLength(1); expect(found[0].start).toBeCloseTo(1.1, 2); expect(found[0].end).toBeCloseTo(1.9, 2);
    expect(editedDuration(applySilenceCuts(edit, found))).toBeCloseTo(2.2, 2); expect(edit.cuts).toEqual([]);
    expect(() => applySilenceCuts(edit, [{ start: 0, end: 3 }])).toThrow('Keep at least');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
