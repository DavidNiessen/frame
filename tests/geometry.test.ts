import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ffmpegPath } from '../electron/native';
import ffprobe from '@ffprobe-installer/ffprobe';
import { buildExportArgs } from '../src/core/export-plan';
import { defaultSettings, type MediaAsset } from '../src/core/types';
const ffmpeg = ffmpegPath();
const exec = promisify(execFile);
it('rotates and flips asymmetric pixels and exports the requested resized frame', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-geometry-'));
  try {
    const asset: MediaAsset = {
      id: 'clip',
      name: 'clip.mp4',
      size: 1,
      kind: 'video',
      duration: 1,
      width: 100,
      height: 60,
      hasAudio: false,
      previewUrl: '',
    };
    const input = join(directory, 'pattern.mp4');
    const output = join(directory, 'rotated.mp4');
    await exec(ffmpeg!, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=blue:s=100x60:d=1,drawbox=x=0:y=0:w=50:h=60:color=red:t=fill',
      '-threads',
      '1',
      input,
    ]);
    const edit = {
      ...defaultSettings(asset),
      geometry: { rotation: 90 as const, flipHorizontal: false, flipVertical: true, resize: null },
    };
    await exec(ffmpeg!, buildExportArgs(asset, edit, input, output));
    const { stdout } = await exec(
      ffmpeg!,
      ['-v', 'error', '-i', output, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
      { encoding: 'buffer', maxBuffer: 1_000_000 },
    );
    const top = (10 * 60 + 30) * 3,
      bottom = (90 * 60 + 30) * 3;
    expect(stdout[top + 2]).toBeGreaterThan(200);
    expect(stdout[bottom]).toBeGreaterThan(200);
    await exec(
      ffmpeg!,
      buildExportArgs(
        asset,
        {
          ...edit,
          geometry: { ...edit.geometry, resize: { width: 120, height: 120, fit: 'contain' } },
        },
        input,
        output,
      ),
    );
    const probe = await exec(ffprobe.path, ['-v', 'error', '-show_streams', '-of', 'json', output]);
    const video = JSON.parse(probe.stdout).streams[0];
    expect([video.width, video.height]).toEqual([120, 120]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
