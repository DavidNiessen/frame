import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ffmpegPath } from '../electron/native';
import ffprobe from '@ffprobe-installer/ffprobe';
import { importSubtitles, outputCues, serializeSrt } from '../src/core/subtitles';
import { buildExportArgs } from '../src/core/export-plan';
import { defaultSettings, type MediaAsset } from '../src/core/types';
const ffmpeg = ffmpegPath();
const exec = promisify(execFile);
const asset: MediaAsset = { id: 'clip', name: 'clip.mp4', size: 1, kind: 'video', hasAudio: true, duration: 4, width: 640, height: 360, previewUrl: '' };
it('maps imported source cues through removed sections and speed changes', () => {
  const subtitles = importSubtitles('WEBVTT\n\n00:00.500 --> 00:03.500\nHello <b>there</b>');
  const cues = outputCues({ ...defaultSettings(asset), subtitles, speed: 2, cuts: [{ start: 1, end: 2 }] });
  expect(cues).toEqual([{ start: .25, end: .5, text: 'Hello there' }, { start: .5, end: 1.25, text: 'Hello there' }]);
  expect(serializeSrt(cues)).toContain('00:00:00,250 --> 00:00:00,500');
});
it('embeds a selectable caption stream and burns captions using the bundled font', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-captions-'));
  try {
    const paths = { chapters: join(directory, 'chapters.ffmetadata'), captions: join(directory, 'captions.srt'), fonts: resolve('public/fonts'), text: join(directory, 'text.txt'), image: join(directory, 'image.png'), lut: join(directory, 'lut.cube') };
    const edit = { ...defaultSettings(asset), end: 1, subtitles: importSubtitles('1\n00:00:00,000 --> 00:00:01,000\nA real caption') };
    await writeFile(paths.captions, serializeSrt(outputCues(edit)));
    const embedded = join(directory, 'embedded.mp4'); const burned = join(directory, 'burned.mp4');
    await exec(ffmpeg!, buildExportArgs(asset, { ...edit, subtitles: { ...edit.subtitles, mode: 'embed' } }, resolve('public/sample.mp4'), embedded, paths));
    const { stdout } = await exec(ffprobe.path, ['-v', 'error', '-show_streams', '-of', 'json', embedded]);
    expect(JSON.parse(stdout).streams.some((s: { codec_name: string }) => s.codec_name === 'mov_text')).toBe(true);
    await exec(ffmpeg!, buildExportArgs(asset, edit, resolve('public/sample.mp4'), burned, paths));
    const frame = async (p: string) => (await exec(ffmpeg!, ['-v', 'error', '-i', p, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer', maxBuffer: 2_000_000 })).stdout;
    expect((await frame(burned)).equals(await frame(embedded))).toBe(false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
