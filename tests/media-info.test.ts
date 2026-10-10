import { expect, it } from 'vitest';
import { parseFrameRate, parseProbe } from '../src/core/probe';
it('reads fractional frame rates, ignores cover art video and whitelists bounded metadata', () => {
  const result = parseProbe({ format: { duration: '6', tags: { TITLE: 'Song', artist: 'Artist', COMMENT: 'x'.repeat(3000), secret: 'Ignored' } }, streams: [
    { index: 0, codec_type: 'video', disposition: { attached_pic: 1 }, codec_name: 'mjpeg', avg_frame_rate: '90000/1' },
    { index: 1, codec_type: 'video', codec_name: 'h264', avg_frame_rate: '30000/1001', width: 1920, height: 1080 },
    { index: 2, codec_type: 'audio', codec_name: 'aac', channels: 2, sample_rate: '48000' },
  ] });
  expect(result).toMatchObject({ frameRate: 30000 / 1001, videoCodec: 'h264', audioCodec: 'aac', audioChannels: 2, audioSampleRate: 48000, artworkIndex: 0 });
  expect(result.metadata).toEqual({ title: 'Song', artist: 'Artist', comment: 'x'.repeat(2000) });
  expect(parseProbe({ format: { duration: '2' }, streams: [{ index: 0, codec_type: 'video', avg_frame_rate: '0/0', r_frame_rate: '24/1' }] }).frameRate).toBe(24);
  for (const invalid of ['0/0', '1/0', '-1/1', '1001/1', '30/1/1', 'NaN', '']) expect(parseFrameRate(invalid)).toBeUndefined();
});
