import type { UrlImportOptions } from '../src/core/youtube';

export function youtubeArgs(url: string, directory: string, ffmpeg: string, runtime: string, options: Required<UrlImportOptions>['youtube']) {
  const height = options.quality === 'best' ? '' : `[height<=${options.quality}]`;
  const format = options.mode === 'audio' ? 'ba[ext=m4a]/ba' : `bv*${height}+ba/b${height}`;
  return ['--ignore-config', '--no-plugin-dirs', '--no-update', '--no-cache-dir', '--no-remote-components',
    '--no-playlist', '--match-filter', '!is_live', '--socket-timeout', '30', '--retries', '2', '--fragment-retries', '2',
    '--no-js-runtimes', '--js-runtimes', `node:${runtime}`, '--ffmpeg-location', ffmpeg,
    '--paths', directory, '--output', '%(title).100B [%(id)s].%(ext)s', '--windows-filenames', '--trim-filenames', '180',
    '--format', format, '--format-sort', 'res,ext:mp4:m4a', '--merge-output-format', 'mp4/mkv', '--encoding', 'utf-8', '--newline', '--progress', '--progress-delta', '.2',
    '--progress-template', 'download:FRAME_PROGRESS:{"downloaded":%(progress.downloaded_bytes)j,"total":%(progress.total_bytes)j,"estimate":%(progress.total_bytes_estimate)j,"status":%(progress.status)j}',
    '--print', 'after_move:FRAME_FILE:%(filepath)j', '--no-simulate', '--', url];
}
export function youtubeFailure(log: string): string {
  if (/sign in to confirm|not a bot|po.?token|HTTP Error 403|HTTP Error 429/i.test(log)) return 'YouTube blocked this download. Try again later; some videos cannot be downloaded from this connection.';
  if (/private video|sign in|age.?restrict|members.only|login|cookies/i.test(log)) return 'This video requires sign-in or has access restrictions. Frame currently supports publicly accessible videos.';
  if (/unavailable|not available|removed|copyright|geo.?restrict/i.test(log)) return 'This YouTube video is unavailable or restricted in your region.';
  if (/is_live|live video|live stream/i.test(log)) return 'Live streams are not supported. Try a completed video.';
  if (/requested format.*not available/i.test(log)) return 'This quality is not available for the video. Try Best available or another video.';
  return 'Could not download this YouTube video. Check the link, try again, or update Frame if YouTube has changed.';
}
