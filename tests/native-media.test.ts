import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ffmpegPath, ffprobePath, probeFile, transcode } from '../electron/native';
import { defaultSettings, type MediaAsset, type FormatId } from '../src/core/types';
const exec = promisify(execFile);
let directory: string;
let asset: MediaAsset;
const source = resolve('public/sample.mp4');
async function inspect(path: string) {
  const { stdout } = await exec(ffprobePath(), ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path], { env: { ...process.env, PATH: '' } });
  return JSON.parse(stdout);
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'frame-media-tests-'));
  asset = { ...await probeFile(source), id: 'fixture', name: 'sample.mp4', previewUrl: '' };
});
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });
describe('portable native media engine', () => {
  it('bundles executable FFmpeg and FFprobe without requiring PATH', async () => {
    for (const path of [ffmpegPath(), ffprobePath()]) {
      const { stdout } = await exec(path, ['-version'], { env: { ...process.env, PATH: '' } });
      expect(stdout).toMatch(/ff(mpeg|probe) version/);
    }
  });
  it.each<FormatId>(['mp4', 'webm', 'mov', 'mkv', 'gif', 'mp3', 'wav', 'flac', 'ogg', 'm4a'])('exports real %s media', async format => {
    const output = join(directory, `trim.${format}`);
    const edit = { ...defaultSettings(asset), start: 1, end: 2, crop: { x: 0, y: 0, width: 320, height: 180 }, format };
    await transcode(source, output, asset, edit, () => {}).done;
    const info = await inspect(output);
    expect(Number(info.format.duration)).toBeGreaterThan(0.8);
    expect(Number(info.format.duration)).toBeLessThan(1.3);
    const video = info.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
    if (['mp4', 'webm', 'mov', 'mkv', 'gif'].includes(format)) {
      expect(video.width).toBe(320); expect(video.height).toBe(180);
    } else expect(info.streams.some((s: { codec_type: string }) => s.codec_type === 'audio')).toBe(true);
  });
  it('joins retained video and audio sections after removal', async () => {
    const output = join(directory, 'cut.mp4');
    await transcode(source, output, asset, { ...defaultSettings(asset), start: 1, end: 5, cuts: [{ start: 2, end: 4 }] }, () => {}).done;
    const info = await inspect(output);
    expect(Number(info.format.duration)).toBeCloseTo(2, 1);
    expect(info.streams.map((s: { codec_type: string }) => s.codec_type).sort()).toEqual(['audio', 'video']);
  });
  it('joins audio-only retained sections and converts WAV to FLAC', async () => {
    const wav = join(directory, 'tone.wav');
    await exec(ffmpegPath(), ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-threads', '2', wav]);
    const audio: MediaAsset = { ...await probeFile(wav), id: 'audio', name: 'tone.wav', previewUrl: '' };
    const output = join(directory, 'tone.flac');
    await transcode(wav, output, audio, { ...defaultSettings(audio), format: 'flac', cuts: [{ start: 1, end: 2 }] }, () => {}).done;
    const info = await inspect(output);
    expect(info.streams[0].codec_name).toBe('flac');
    expect(Number(info.format.duration)).toBeCloseTo(2, 1);
  });
  it('applies volume changes to decoded audio samples', async () => {
    const original = join(directory, 'original.wav'); const quieter = join(directory, 'quieter.wav');
    for (const [output, volume] of [[original, 1], [quieter, 0.5]] as const) await transcode(source, output, asset, { ...defaultSettings(asset), format: 'wav', start: 0, end: 1, volume }, () => {}).done;
    const pcm = async (file: string) => (await exec(ffmpegPath(), ['-v', 'error', '-i', file, '-f', 'f32le', '-'], { encoding: 'buffer', maxBuffer: 2_000_000 })).stdout;
    const rms = (buffer: Buffer) => { let sum = 0; for (let i = 0; i < buffer.length; i += 4) sum += buffer.readFloatLE(i) ** 2; return Math.sqrt(sum / (buffer.length / 4)); };
    expect(rms(await pcm(quieter)) / rms(await pcm(original))).toBeCloseTo(0.5, 2);
  });
  it('preserves artwork by default and removes it on request', async () => {
    const picture = join(directory, 'cover.jpg'); const mp3 = join(directory, 'cover.mp3');
    await exec(ffmpegPath(), ['-y', '-f', 'lavfi', '-i', 'color=green:s=64x64', '-frames:v', '1', '-threads', '1', picture]);
    await exec(ffmpegPath(), ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-i', picture, '-map', '0:a', '-map', '1:v', '-c:a', 'libmp3lame', '-c:v', 'copy', '-disposition:v', 'attached_pic', '-metadata', 'title=Test title', mp3]);
    const audio: MediaAsset = { ...await probeFile(mp3), id: 'cover', name: 'cover.mp3', previewUrl: '' };
    expect(audio.kind).toBe('audio'); expect(audio.artworkIndex).toBe(1);
    for (const includeArtwork of [true, false]) {
      const output = join(directory, `art-${includeArtwork}.flac`);
      await transcode(mp3, output, audio, { ...defaultSettings(audio), format: 'flac', includeArtwork }, () => {}).done;
      const info = await inspect(output);
      expect(info.streams.some((s: { disposition?: { attached_pic?: number } }) => s.disposition?.attached_pic === 1)).toBe(includeArtwork);
      expect(info.format.tags.title).toBe('Test title');
    }
  });
});
