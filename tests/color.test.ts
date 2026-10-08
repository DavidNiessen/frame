import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { parseCube } from '../src/core/color';
import { framePreviewArgs } from '../src/core/frame-preview';
import { resourcePaths } from '../src/core/resources';
import { defaultSettings, type MediaAsset } from '../src/core/types';
const exec = promisify(execFile);
export const invertedCube = 'LUT_3D_SIZE 2\n1 1 1\n0 1 1\n1 0 1\n0 0 1\n1 1 0\n0 1 0\n1 0 0\n0 0 0\n';
it('rejects incomplete or unsupported LUTs', () => { expect(() => parseCube('LUT_3D_SIZE 33\n0 0 0')).toThrow(); expect(() => parseCube('LUT_1D_SIZE 2\n0 0 0\n1 1 1')).toThrow(); expect(parseCube(invertedCube)).toContain('DOMAIN_MAX 1 1 1'); });
it('renders measured grayscale correction and an actual inverted LUT', async () => {
  const directory = await mkdtemp(join(tmpdir(), process.platform === 'win32' ? "frame-color '[],-" : "frame-color :'[],;-"));
  try {
    const input = join(directory, 'red.mp4'), output = join(directory, 'frame.png');
    await exec(ffmpeg!, ['-y', '-f', 'lavfi', '-i', 'color=red:s=100x60:d=1', '-threads', '1', input]);
    const asset: MediaAsset = { id: 'red', name: 'red.mp4', size: 1, duration: 1, kind: 'video', width: 100, height: 60, hasAudio: false, previewUrl: '' };
    const edit = defaultSettings(asset); edit.color.saturation = 0; const paths = { ...resourcePaths(join(directory, 'color')), fonts: resolve('public/fonts') };
    const pixel = async () => (await exec(ffmpeg!, ['-v', 'error', '-i', output, '-vf', 'scale=1:1', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer', maxBuffer: 1_000_000 })).stdout;
    await exec(ffmpeg!, framePreviewArgs(asset, edit, .2, input, output, paths)); const gray = await pixel(); expect(Math.abs(gray[0] - gray[2])).toBeLessThan(5);
    edit.color.saturation = 1; edit.color.lut = parseCube(invertedCube); await writeFile(paths.lut, edit.color.lut);
    await exec(ffmpeg!, framePreviewArgs(asset, edit, .2, input, output, paths)); const cyan = await pixel(); expect(cyan[0]).toBeLessThan(15); expect(cyan[1]).toBeGreaterThan(230); expect(cyan[2]).toBeGreaterThan(230);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
