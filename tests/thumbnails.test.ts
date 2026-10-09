import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegPath } from '../electron/native';
import ffprobe from '@ffprobe-installer/ffprobe';
import { thumbnailArgs, thumbnailCount, thumbnailWidth, thumbnailHeight } from '../src/core/thumbnails';
import type { MediaAsset } from '../src/core/types';
const ffmpeg = ffmpegPath();
const exec = promisify(execFile);
it('renders a bounded strip of real source frames', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-thumbs-'));
  try {
    const output = join(directory, 'strip.png');
    const asset: MediaAsset = { id: '', name: 'sample.mp4', size: 1, kind: 'video', hasAudio: true, duration: 6, width: 640, height: 360, previewUrl: '' };
    await exec(ffmpeg!, thumbnailArgs(asset, 'public/sample.mp4', output));
    const { stdout } = await exec(ffprobe.path, ['-v', 'error', '-show_streams', '-of', 'json', output]);
    const stream = JSON.parse(stdout).streams[0]; expect(stream.width).toBe(thumbnailCount * thumbnailWidth); expect(stream.height).toBe(thumbnailHeight);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
