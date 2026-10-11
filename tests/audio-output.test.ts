import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ffmpegPath, ffprobePath, probeFile } from '../electron/native';
import { defaultSettings, type MediaAsset } from '../src/core/types';
import { buildExportArgs } from '../src/core/export-plan';
import { parseEdit } from '../src/core/project';
import { parseOutputSettings, outputSettings } from '../src/core/presets';
import { estimateSize } from '../src/core/size';
const exec = promisify(execFile);
const asset: MediaAsset = {
  id: 'source',
  name: 'source.mp4',
  size: 1,
  kind: 'video',
  duration: 6,
  width: 640,
  height: 360,
  hasAudio: true,
  audioSampleRate: 48000,
  audioChannels: 2,
  previewUrl: '',
};
it('restores audio settings from projects and presets while reading older documents', () => {
  const edit = {
    ...defaultSettings(asset),
    audioSampleRate: 16000,
    audioChannels: 1,
    wavDepth: 24 as const,
  };
  expect(parseEdit(JSON.parse(JSON.stringify(edit)), asset)).toEqual(edit);
  expect(parseOutputSettings(outputSettings(edit)).wavDepth).toBe(24);
  const legacy = JSON.parse(JSON.stringify(edit));
  delete legacy.audioSampleRate;
  delete legacy.audioChannels;
  delete legacy.wavDepth;
  expect(parseEdit(legacy, asset)).toMatchObject({
    audioSampleRate: null,
    audioChannels: null,
    wavDepth: 16,
  });
  for (const patch of [
    { audioSampleRate: 12345 },
    { audioChannels: 3 },
    { wavDepth: 20 },
    { format: 'webm', audioSampleRate: 44100 },
  ])
    expect(() => parseEdit({ ...edit, ...patch }, asset)).toThrow();
});
it('accounts for requested PCM rate, channels and bit depth in size estimates', () => {
  expect(
    estimateSize(asset, {
      ...defaultSettings(asset),
      format: 'wav',
      audioSampleRate: 16000,
      audioChannels: 1,
      wavDepth: 24,
    })!.low,
  ).toBe(6 * 16000 * 3);
});
it('exports actual mono 16kHz WAV/MP3 and stereo float WAV audio', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-audio-output-'));
  try {
    const source = resolve('tests/fixtures/sample.mp4'),
      loaded = { ...asset, ...(await probeFile(source)) };
    for (const [format, rate, channels, depth, codec] of [
      ['wav', 16000, 1, 24, 'pcm_s24le'],
      ['mp3', 16000, 1, 16, 'mp3'],
      ['wav', 48000, 2, 32, 'pcm_f32le'],
    ] as const) {
      const edit = {
        ...defaultSettings(loaded),
        end: 1,
        format,
        audioSampleRate: rate,
        audioChannels: channels,
        wavDepth: depth,
      };
      const output = join(directory, `${rate}-${depth}.${format}`);
      await exec(ffmpegPath(), buildExportArgs(loaded, edit, source, output));
      const { stdout } = await exec(ffprobePath(), [
        '-v',
        'error',
        '-show_streams',
        '-of',
        'json',
        output,
      ]);
      expect(
        JSON.parse(stdout).streams.find(
          (stream: { codec_type: string }) => stream.codec_type === 'audio',
        ),
      ).toMatchObject({ codec_name: codec, sample_rate: String(rate), channels });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
