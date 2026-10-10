import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ffmpegPath } from '../../electron/native';
import ffprobe from '@ffprobe-installer/ffprobe';

const ffmpeg = ffmpegPath();
const exec = promisify(execFile);
export async function conversionLibrary() {
  const directory = await mkdtemp(join(tmpdir(), 'frame-conversion-'));
  const root = join(directory, 'Music');
  const sources = ['Album One', 'Album Two'].map(album => join(root, album, 'Song.wav'));
  for (const source of sources) {
    await mkdir(join(source, '..'), { recursive: true });
    await exec(ffmpeg!, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-metadata', 'title=Portable Song', '-metadata', 'artist=Frame Artist', source]);
  }
  await writeFile(join(root, 'broken.wav'), 'Not a waveform file');
  await writeFile(join(root, 'booklet.txt'), 'Skip non-media');
  return { directory, root, sources };
}
export async function probeConversion(path: string) {
  const { stdout } = await exec(ffprobe.path, ['-v', 'error', '-show_format', '-show_streams', '-show_chapters', '-of', 'json', path], { env: { ...process.env, PATH: '' } });
  return JSON.parse(stdout);
}
