import { describe, expect, it } from 'vitest';
import { buildExportArgs, validateEdit, outputName } from '../src/core/export-plan';
import { defaultSettings, type MediaAsset } from '../src/core/types';
import { parseProbe } from '../src/core/probe';
const video: MediaAsset = { id: 'test', name: 'clip.mp4', size: 100, kind: 'video', duration: 10, width: 640, height: 480, hasAudio: true, previewUrl: '' };
describe('export planning', () => {
  it('trims, crops, and applies volume with accurate re-encoding', () => {
    const args = buildExportArgs(video, { ...defaultSettings(video), start: 2, end: 7, crop: { x: 10, y: 20, width: 320, height: 240 }, volume: 0.5 }, 'input.mp4', 'out.mp4');
    expect(args).toContain('crop=320:240:10:20,scale=trunc(iw/2)*2:trunc(ih/2)*2');
    expect(args).toContain('volume=0.5');
    expect(args.slice(0, 7)).toEqual(['-y', '-ss', '2', '-t', '5', '-i', 'input.mp4']);
  });
  it('preserves attached artwork by default on supported audio outputs', () => {
    const audio = { ...video, kind: 'audio' as const, artworkIndex: 1 };
    expect(buildExportArgs(audio, defaultSettings(audio), 'in.mp3', 'out.mp3')).toContain('attached_pic');
    expect(buildExportArgs(audio, { ...defaultSettings(audio), includeArtwork: false }, 'in.mp3', 'out.mp3')).toContain('-vn');
  });
  it('generates a palette for GIF and excludes audio', () => {
    const args = buildExportArgs(video, { ...defaultSettings(video), format: 'gif' }, 'in', 'out.gif');
    expect(args).toContain('-an');
    expect(args.join(' ')).toContain('palettegen');
  });
  it.each([{ start: -1 }, { end: 11 }, { start: 4, end: 4 }, { volume: NaN }, { volume: 4 }, { crop: { x: 600, y: 0, width: 100, height: 100 } }])('rejects invalid settings %j', invalid => {
    expect(() => validateEdit(video, { ...defaultSettings(video), ...invalid })).toThrow();
  });
  it('rejects extraction from silent video and video from audio', () => {
    expect(() => validateEdit({ ...video, hasAudio: false }, { ...defaultSettings(video), format: 'mp3' })).toThrow('no audio');
    expect(() => validateEdit({ ...video, kind: 'audio' }, defaultSettings(video))).toThrow('Audio cannot');
  });
  it('sanitizes output names', () => expect(outputName('hello:world.mp4', 'gif')).toBe('hello_world-edited.gif'));
});
describe('probe interpretation', () => {
  it('treats cover art as artwork, not a video track', () => {
    expect(parseProbe({ format: { duration: '12' }, streams: [{ index: 0, codec_type: 'audio' }, { index: 1, codec_type: 'video', disposition: { attached_pic: 1 } }] })).toMatchObject({ kind: 'audio', hasAudio: true, artworkIndex: 1 });
  });
  it('uses displayed dimensions for rotated phone footage', () => {
    expect(parseProbe({ format: { duration: '6' }, streams: [{ index: 0, codec_type: 'video', width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] }] })).toMatchObject({ width: 1080, height: 1920 });
  });
  it('rejects files without usable duration', () => expect(() => parseProbe({ streams: [{ index: 0, codec_type: 'audio' }] })).toThrow('duration'));
});
