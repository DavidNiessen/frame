import type { DownloadOptions, OnlineMedia } from '../src/core/online-media';

export function onlineMediaArgs(
  url: string,
  directory: string,
  ffmpeg: string,
  runtime: string,
  options: DownloadOptions,
) {
  const height = options.quality === 'best' ? '' : `[height<=${options.quality}]`;
  const format =
    options.mode === 'audio' ? 'ba[ext=m4a]/ba/b' : `bv*${height}+ba/b${height}/bv*${height}`;
  return [
    '--ignore-config',
    '--no-plugin-dirs',
    '--no-update',
    '--no-cache-dir',
    '--no-remote-components',
    '--no-playlist',
    '--playlist-end',
    '1',
    '--match-filter',
    '!is_live & !playlist_id',
    '--socket-timeout',
    '30',
    '--retries',
    '2',
    '--fragment-retries',
    '2',
    '--no-js-runtimes',
    '--js-runtimes',
    `node:${runtime}`,
    '--ffmpeg-location',
    ffmpeg,
    '--paths',
    directory,
    '--output',
    '%(title).100B [%(id)s].%(ext)s',
    '--windows-filenames',
    '--trim-filenames',
    '180',
    '--format',
    format,
    '--format-sort',
    'res,ext:mp4:m4a',
    '--merge-output-format',
    'mp4/mkv',
    ...(options.mode === 'audio' ? ['--extract-audio', '--audio-format', 'best'] : []),
    '--encoding',
    'utf-8',
    '--newline',
    '--no-quiet',
    '--progress',
    '--progress-delta',
    '.2',
    '--progress-template',
    'download:FRAME_PROGRESS:{"downloaded":%(progress.downloaded_bytes)j,"total":%(progress.total_bytes)j,"estimate":%(progress.total_bytes_estimate)j,"status":%(progress.status)j}',
    '--print',
    'after_move:FRAME_FILE:%(filepath)j',
    '--no-simulate',
    '--',
    url,
  ];
}
export function onlineMediaFailure(
  log: string,
  source: Pick<OnlineMedia, 'name' | 'kind'>,
): string {
  const item = source.kind === 'audio' ? 'track' : 'video';
  if (
    /private video|private track|sign in|age.?restrict|members.only|login|cookies|password|subscription|purchase|paid/i.test(
      log,
    ) &&
    !/not a bot/i.test(log)
  )
    return `This ${source.name} ${item} requires sign-in or has access restrictions. Frame supports publicly accessible media without account sign-in.`;
  if (/not a bot|po.?token|HTTP Error 403|HTTP Error 429|captcha|rate.?limit/i.test(log))
    return `${source.name} blocked this download. Try again later; some links cannot be downloaded from this connection.`;
  if (
    /unavailable|not available|removed|copyright|geo.?restrict|not found|HTTP Error 404/i.test(log)
  )
    return `This ${source.name} ${item} is unavailable or restricted in your region.`;
  if (/does not pass filter.*(?:is_live|playlist_id)/i.test(log))
    return 'Live streams, playlists and collections are not supported. Paste an individual completed video or track link.';
  if (/is_live|live video|live stream/i.test(log))
    return 'Live streams are not supported. Try a completed video.';
  if (/requested format.*not available/i.test(log))
    return 'This quality or media type is not available. Try Best available, video mode, or another link.';
  return `Could not download this ${source.name} ${item}. Check the link, try again, or update Frame if the service has changed.`;
}
