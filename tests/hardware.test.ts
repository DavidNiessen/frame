import { expect, it } from 'vitest';
import { allCores, hardwarePlan, hardwareFallback, hardwareBitrate } from '../src/core/hardware';
it('replaces only H264 encoding controls and preserves target bitrate and source inputs', () => {
  const plan = [
    '-i',
    'original.mp4',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    '23',
    '-preset',
    'fast',
    '-b:v',
    '1200k',
    'output.mp4',
  ];
  const hardware = hardwarePlan(plan, 'h264_qsv', 3000);
  expect(hardware).toContain('h264_qsv');
  expect(hardware).toContain('nv12');
  expect(hardware).toContain('1200k');
  expect(hardware).not.toContain('-crf');
  expect(hardware).toContain('original.mp4');
  expect(plan).toContain('libx264');
  expect(hardwarePlan(['-c:v', 'libvpx-vp9', 'out.webm'], 'h264_nvenc', 1000)).toEqual([
    '-c:v',
    'libvpx-vp9',
    'out.webm',
  ]);
});
it('retries failed hardware in software and never retries cancelled work', async () => {
  const attempts: string[][] = [];
  const software = ['software'],
    hardware = ['hardware'];
  await hardwareFallback(
    software,
    hardware,
    async (plan) => {
      attempts.push(plan);
      if (plan === hardware) throw new Error('Device disconnected');
    },
    () => false,
  );
  expect(attempts).toEqual([hardware, software]);
  attempts.length = 0;
  await expect(
    hardwareFallback(
      software,
      hardware,
      async (plan) => {
        attempts.push(plan);
        throw new Error('Cancelled');
      },
      () => true,
    ),
  ).rejects.toThrow('Cancelled');
  expect(attempts).toEqual([hardware]);
});

it('honors hardware quality presets while keeping explicit target bitrates', () => {
  const small = hardwareBitrate(640, 360, 'small'),
    balanced = hardwareBitrate(640, 360, 'balanced'),
    high = hardwareBitrate(640, 360, 'high');
  expect(small).toBeLessThan(balanced);
  expect(balanced).toBeLessThan(high);
  const args = ['-c:v', 'libx264', '-b:v', '568k', 'output.mp4'];
  expect(hardwarePlan(args, 'h264_nvenc', high)).toContain('568k');
});
it('lifts thread caps for exports without touching other arguments', () => {
  expect(
    allCores([
      '-i',
      'in.mp4',
      '-filter_threads',
      '2',
      '-filter_complex_threads',
      '1',
      '-c:v',
      'libx264',
      '-threads',
      '2',
      'out.mp4',
    ]),
  ).toEqual(['-i', 'in.mp4', '-c:v', 'libx264', 'out.mp4']);
  expect(allCores(['-i', 'in.mp4', '-threads'])).toEqual(['-i', 'in.mp4', '-threads']);
});
