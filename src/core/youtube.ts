import { mediaUrl } from './remote-media';

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
