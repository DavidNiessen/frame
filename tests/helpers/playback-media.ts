import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ffmpegPath } from '../../electron/native';
export async function playbackMedia() {
  const directory = await mkdtemp(join(tmpdir(), 'frame-playback-'));
  const audio = join(directory, 'Playback.wav'),
    video = join(directory, 'Playback.mp4');
  try {
    const exec = promisify(execFile);
    await exec(ffmpegPath(), ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=20', audio]);
    await exec(ffmpegPath(), [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=160x90:r=10:d=20',
      '-i',
      audio,
      '-c:v',
      'libx264',
      '-threads',
      '1',
      '-preset',
      'ultrafast',
      '-c:a',
      'aac',
      '-shortest',
      video,
    ]);
    return { directory, audio, video };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
