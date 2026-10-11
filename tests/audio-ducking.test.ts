import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildExportArgs } from '../src/core/export-plan';
import { sourceIdentity, parseEdit } from '../src/core/project';
import { defaultSettings } from '../src/core/types';
import { ffmpegPath, probeFile } from '../electron/native';
import type { AudioLayer } from '../src/core/audio-layers';
const exec = promisify(execFile);
it('reduces music only during speech, preserves voice level and recovers in silent gaps', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-ducking-'));
  try {
    const voicePath = join(directory, 'voice.wav'),
      musicPath = join(directory, 'music.wav');
    await exec(ffmpegPath(), [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'aevalsrc=if(between(t\\,1\\,2)\\,0.5*sin(2*PI*880*t)\\,0):s=48000:d=4',
      '-c:a',
      'pcm_f32le',
      voicePath,
    ]);
    await exec(ffmpegPath(), [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=220:sample_rate=48000:duration=4',
      '-c:a',
      'pcm_f32le',
      musicPath,
    ]);
    const voice = {
        ...(await probeFile(voicePath)),
        id: 'voice',
        name: 'voice.wav',
        previewUrl: '',
      },
      music = { ...(await probeFile(musicPath)), id: 'music', name: 'music.wav', previewUrl: '' },
      layer: AudioLayer = {
        id: 'music',
        role: 'music',
        source: sourceIdentity(music),
        start: 0,
        end: 4,
        sourceStart: 0,
        sourceEnd: 4,
        volume: 1,
        muted: false,
        loop: false,
        fadeIn: 0,
        fadeOut: 0,
      };
    const edit = {
      ...defaultSettings(voice),
      format: 'wav' as const,
      audioChannels: 1,
      audioDucking: true,
      audioLayers: [layer],
    };
    const amplitude = (bytes: Buffer, frequency: number, start: number) => {
      let real = 0,
        imaginary = 0;
      const count = 9600;
      for (let n = 0; n < count; n++) {
        const sample = bytes.readFloatLE((Math.round(start * 48000) + n) * 4),
          angle = (2 * Math.PI * frequency * n) / 48000;
        real += sample * Math.cos(angle);
        imaginary += sample * Math.sin(angle);
      }
      return (Math.hypot(real, imaginary) * 2) / count;
    };
    const pcm: Buffer[] = [];
    for (const ducking of [false, true]) {
      const output = join(directory, `mix-${ducking}.wav`),
        raw = join(directory, `mix-${ducking}.raw`);
      await exec(
        ffmpegPath(),
        buildExportArgs(voice, { ...edit, audioDucking: ducking }, voicePath, output, undefined, [
          { layer, path: musicPath },
        ]),
      );
      await exec(ffmpegPath(), [
        '-y',
        '-i',
        output,
        '-ac',
        '1',
        '-ar',
        '48000',
        '-f',
        'f32le',
        raw,
      ]);
      pcm.push(await readFile(raw));
    }
    expect(amplitude(pcm[1], 220, 0.3)).toBeCloseTo(amplitude(pcm[0], 220, 0.3), 3);
    expect(amplitude(pcm[1], 220, 1.4)).toBeLessThan(amplitude(pcm[0], 220, 1.4) * 0.4);
    expect(amplitude(pcm[1], 880, 1.4)).toBeCloseTo(amplitude(pcm[0], 880, 1.4), 2);
    expect(amplitude(pcm[1], 220, 3.6)).toBeGreaterThan(amplitude(pcm[0], 220, 3.6) * 0.9);
    const narration: AudioLayer = {
        ...layer,
        id: 'narration',
        role: 'voiceover',
        source: sourceIdentity(voice),
      },
      mixedOutput = join(directory, 'voiceover.wav');
    await exec(
      ffmpegPath(),
      buildExportArgs(
        { ...voice, hasAudio: false },
        { ...edit, audioLayers: [narration, layer] },
        voicePath,
        mixedOutput,
        undefined,
        [
          { layer: narration, path: voicePath },
          { layer, path: musicPath },
        ],
      ),
    );
    const mixedRaw = join(directory, 'voiceover.raw');
    await exec(ffmpegPath(), [
      '-y',
      '-i',
      mixedOutput,
      '-ac',
      '1',
      '-ar',
      '48000',
      '-f',
      'f32le',
      mixedRaw,
    ]);
    const voiceover = await readFile(mixedRaw);
    expect(amplitude(voiceover, 220, 1.4)).toBeCloseTo(amplitude(pcm[1], 220, 1.4), 3);
    expect(parseEdit(edit, voice).audioDucking).toBe(true);
    expect(() =>
      parseEdit({ ...edit, audioLayers: [{ ...layer, role: 'invalid' }] }, voice),
    ).toThrow('music or voiceover');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
