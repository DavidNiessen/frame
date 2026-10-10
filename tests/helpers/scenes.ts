import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegPath } from '../../electron/native';
export async function sceneFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'frame-scene-fixture-')), source = join(directory, 'scenes.mp4');
  await promisify(execFile)(ffmpegPath(), ['-y', ...['red', 'green', 'blue'].flatMap(color => ['-f', 'lavfi', '-i', `color=c=${color}:s=160x90:r=12:d=1`]), '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', source]);
  return { directory, source };
}
