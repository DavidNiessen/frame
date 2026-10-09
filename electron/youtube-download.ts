import { stat } from 'node:fs/promises';
import type { ExportProgress } from '../src/core/types';
import { youtubeOptions } from '../src/core/youtube';
import { ffmpegPath } from './native';
import { youtubeArgs } from './youtube-plan';
import { runYoutubeDownloader } from './youtube-process';
import { portableToolPath } from './tool-paths';

export function youtubeToolPath() {
  return portableToolPath('yt-dlp');
}
export async function downloadYoutube(url: string, directory: string, input: unknown, signal: AbortSignal, progress: (value: ExportProgress) => void) {
  signal.throwIfAborted();
  const options = youtubeOptions(input), binary = youtubeToolPath();
  if (!(await stat(binary).catch(() => null))?.isFile()) throw new Error('The bundled YouTube downloader is missing. Reinstall Frame, or run pnpm setup:desktop in a development checkout.');
  progress({ ratio: 0, message: 'Reading YouTube video…' });
  return runYoutubeDownloader(binary, youtubeArgs(url, directory, ffmpegPath(), process.execPath, options), directory, options.mode, signal, progress);
}
