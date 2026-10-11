import { mediaUrl } from './remote-media';

export interface UrlImportOptions {
  youtube?: { mode: 'video' | 'audio'; quality: 'best' | '1080' | '720' | '480' };
}
const hosts = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);
export function youtubeVideo(input: string): string | null {
  const url = mediaUrl(input);
  if (!hosts.has(url.hostname.toLowerCase())) return null;
  const segments = url.pathname.split('/').filter(Boolean);
  const id = url.hostname.endsWith('youtu.be')
    ? segments[0]
    : url.pathname === '/watch'
      ? url.searchParams.get('v')
      : ['shorts', 'embed', 'live'].includes(segments[0])
        ? segments[1]
        : null;
  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id))
    throw new Error(
      'Paste an individual YouTube video link. Playlist-only and channel links are not supported.',
    );
  return `https://www.youtube.com/watch?v=${id}`;
}
export function youtubeOptions(input: unknown): Required<UrlImportOptions>['youtube'] {
  if (input === undefined) return { mode: 'video', quality: '1080' };
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Invalid YouTube import options.');
  const value = (input as UrlImportOptions).youtube;
  if (value === undefined) return { mode: 'video', quality: '1080' };
  if (
    !value ||
    !['video', 'audio'].includes(value.mode) ||
    !['best', '1080', '720', '480'].includes(value.quality)
  )
    throw new Error('Invalid YouTube import options.');
  return { mode: value.mode, quality: value.quality };
}
