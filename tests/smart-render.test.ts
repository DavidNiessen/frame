import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegPath, ffprobePath, probeFile, transcode } from '../electron/native';
import { MediaJobs } from '../electron/jobs';
import { smartRender } from '../electron/smart-render';
import { planSmartRender, smartRenderable } from '../src/core/smart-render';
import { resourcePaths } from '../src/core/resources';
import { defaultSettings, type EditSettings, type MediaAsset } from '../src/core/types';
const exec = promisify(execFile);
let directory: string;
let source: string;
let asset: MediaAsset;

// Gray thumbnails are enough to catch a wrong, missing or corrupted frame.
async function frames(args: string[]) {
  const { stdout } = await exec(
    ffmpegPath(),
    ['-v', 'error', ...args, '-vf', 'scale=64:36', '-pix_fmt', 'gray', '-f', 'rawvideo', '-'],
    { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
  );
  const size = 64 * 36;
  return Array.from({ length: stdout.length / size }, (_, i) =>
    stdout.subarray(i * size, (i + 1) * size),
  );
}
function difference(a: Buffer, b: Buffer) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}
async function render(edit: EditSettings) {
  const output = join(directory, `smart-${Math.random().toString(36).slice(2)}.${edit.format}`);
  const jobs = new MediaJobs();
  const smart = await jobs.run((execute) =>
    smartRender(asset, edit, source, output, resourcePaths(), [], execute, jobs, () => {}),
  );
  return { smart, output };
}
// The full render is the reference: smart rendering must keep exactly the frames it keeps.
async function fullRender(edit: EditSettings) {
  const output = join(directory, `full-${Math.random().toString(36).slice(2)}.${edit.format}`);
  await transcode(source, output, asset, { ...edit, quality: 'high' }, () => {}).done;
  return frames(['-i', output]);
}
async function streams(path: string) {
  const { stdout } = await exec(ffprobePath(), [
    '-v',
    'error',
    '-show_entries',
    'stream=codec_type,duration',
    '-of',
    'json',
    path,
  ]);
  return JSON.parse(stdout).streams as { codec_type: string; duration: string }[];
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'frame-smart-render-'));
  source = join(directory, 'source.mp4');
  // CAVLC and four references make the source's parameter sets differ from the edge pieces'.
  await exec(ffmpegPath(), [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=320x180:r=30:d=12',
    '-f',
    'lavfi',
    '-i',
    'sine=f=440:d=12',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-x264-params',
    'cabac=0:ref=4:keyint=45:min-keyint=45:scenecut=0',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    source,
  ]);
  asset = { ...(await probeFile(source)), id: 'smart', name: 'source.mp4', previewUrl: '' };
}, 60000);
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('smart rendering', () => {
  it('copies only between clean keyframes and encodes the edges', () => {
    const packets = [
      { pts: 0, key: true },
      { pts: 0.1, key: false },
      { pts: 0.2, key: false },
      { pts: 0.4, key: true },
      // A leading picture displayed before its keyframe makes 0.6 unsafe to start a copy.
      { pts: 0.6, key: true },
      { pts: 0.5, key: false },
      { pts: 0.7, key: false },
      { pts: 0.8, key: true },
      { pts: 0.9, key: false },
    ];
    expect(planSmartRender(packets, [{ start: 0.1, end: 0.95 }])).toEqual([
      { kind: 'encode', start: 0.1, frames: 2 },
      { kind: 'copy', start: 0.4, frames: 4 },
      { kind: 'encode', start: 0.8, frames: 2 },
    ]);
    expect(planSmartRender(packets, [{ start: 0.45, end: 0.75 }])).toEqual([
      { kind: 'encode', start: 0.5, frames: 3 },
    ]);
  });

  it('only applies when every kept frame is untouched', () => {
    const edit = defaultSettings(asset);
    expect(smartRenderable(asset, edit, resourcePaths())).toBe(true);
    expect(smartRenderable(asset, { ...edit, volume: 0.5 }, resourcePaths())).toBe(true);
    for (const change of [
      { color: { ...edit.color, saturation: 1.2 } },
      { crop: { x: 0, y: 0, width: 160, height: 90 } },
      { speed: 2 },
      { videoFadeIn: 1 },
      { videoBitrate: 1000 },
      { format: 'webm' as const },
    ])
      expect(smartRenderable(asset, { ...edit, ...change }, resourcePaths())).toBe(false);
  });

  it('exports a frame-accurate trim with the original frames and soundtrack', async () => {
    const edit = { ...defaultSettings(asset), start: 0.7, end: 10.2 };
    const { smart, output } = await render(edit);
    expect(smart).toBe(true);
    const expected = await fullRender(edit);
    const actual = await frames(['-i', output]);
    expect(actual.length).toBe(expected.length);
    for (let i = 0; i < expected.length; i++)
      expect(difference(expected[i], actual[i])).toBeLessThan(3);
    const info = await streams(output);
    expect(info.map((stream) => stream.codec_type)).toEqual(['video', 'audio']);
    for (const stream of info) expect(Number(stream.duration)).toBeCloseTo(9.5, 1);
  }, 60000);

  it('joins the sections around a cut', async () => {
    const edit = { ...defaultSettings(asset), cuts: [{ start: 3.2, end: 7.9 }], format: 'mkv' };
    const { smart, output } = await render(edit as EditSettings);
    expect(smart).toBe(true);
    const expected = await fullRender(edit as EditSettings);
    const actual = await frames(['-i', output]);
    expect(actual.length).toBe(expected.length);
    for (let i = 0; i < expected.length; i++)
      expect(difference(expected[i], actual[i])).toBeLessThan(3);
  }, 60000);

  // Apple's decoders may trust the sample description over in-band parameter sets, so decode
  // through AVFoundation as QuickTime and Photos would.
  it.runIf(process.platform === 'darwin')(
    'plays back correctly through AVFoundation',
    async () => {
      const edit = { ...defaultSettings(asset), start: 0.7, end: 10.2 };
      const { smart, output } = await render(edit);
      expect(smart).toBe(true);
      const decoded = join(directory, 'avfoundation.mov');
      await exec('avconvert', [
        '--source',
        output,
        '--preset',
        'PresetAppleProRes422LPCM',
        '--output',
        decoded,
        '--replace',
      ]);
      const expected = await fullRender(edit);
      const actual = await frames(['-i', decoded]);
      expect(actual.length).toBe(expected.length);
      const worst = Math.max(...expected.map((frame, i) => difference(frame, actual[i])));
      expect(worst).toBeLessThan(4);
    },
    60000,
  );

  it('leaves picture changes to the full render', async () => {
    const edit = {
      ...defaultSettings(asset),
      color: { ...defaultSettings(asset).color, contrast: 1.2 },
    };
    expect((await render(edit)).smart).toBe(false);
  });
});
