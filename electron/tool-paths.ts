import { join } from 'node:path';

/** Only packaged tools or files prepared from the repository; never search PATH. */
export function portableToolPath(name: 'ffmpeg' | 'yt-dlp') {
  const directory =
    process.resourcesPath && !process.defaultApp
      ? join(process.resourcesPath, 'media-tools')
      : join(__dirname, '../build/media-tools');
  return join(directory, process.platform === 'win32' ? `${name}.exe` : name);
}
