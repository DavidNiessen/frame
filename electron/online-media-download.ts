import { stat } from 'node:fs/promises';
import type { ExportProgress } from '../src/core/types';
import { downloadOptions, type OnlineMedia } from '../src/core/online-media';
import { ffmpegPath } from './native';
import { onlineMediaArgs } from './online-media-plan';
import { runOnlineMediaDownloader } from './online-media-process';
import { portableToolPath } from './tool-paths';

function downloaderPath() {
  return portableToolPath('yt-dlp');
}
export async function downloadOnlineMedia(
  source: OnlineMedia,
  directory: string,
  input: unknown,
  signal: AbortSignal,
  progress: (value: ExportProgress) => void,
) {
  signal.throwIfAborted();
  const options = downloadOptions(input, source),
    binary = downloaderPath();
  if (!(await stat(binary).catch(() => null))?.isFile())
    throw new Error(
      'The bundled media downloader is missing. Reinstall Frame, or run pnpm setup:desktop in a development checkout.',
    );
  progress({
    ratio: 0,
    message: `Reading ${source.name} ${source.kind === 'audio' ? 'track' : 'video'}…`,
  });
  return runOnlineMediaDownloader(
    binary,
    onlineMediaArgs(source.url, directory, ffmpegPath(), process.execPath, options),
    directory,
    options.mode,
    signal,
    progress,
    source,
  );
}
