import { mediaUrl } from './remote-media';
import { youtubeVideo } from './youtube';

export interface DownloadOptions {
  mode: 'video' | 'audio';
  quality: 'best' | '1080' | '720' | '480';
}
export interface UrlImportOptions {
  media?: DownloadOptions;
}
export interface OnlineMedia {
  service: string;
  name: string;
  kind: 'video' | 'audio';
  url: string;
}
interface Provider {
  service: string;
  name: string;
  kind: OnlineMedia['kind'];
  host: (host: string) => boolean;
  link: (url: URL) => string | null;
  hint: string;
}
const hosts =
  (...values: string[]) =>
  (host: string) =>
    values.includes(host);
const providers: Provider[] = [
  {
    service: 'instagram',
    name: 'Instagram',
    kind: 'video',
    host: hosts('instagram.com', 'www.instagram.com', 'm.instagram.com'),
    link: (url) => {
      const match = /^\/(?:[\w.]+\/)?(reels?|p|tv)\/([\w-]+)\/?$/.exec(url.pathname);
      return match
        ? `https://www.instagram.com/${match[1] === 'reels' ? 'reel' : match[1]}/${match[2]}/`
        : null;
    },
    hint: 'Paste an individual Instagram Reel or video post link. Profiles, stories and collections are not supported.',
  },
  {
    service: 'tiktok',
    name: 'TikTok',
    kind: 'video',
    host: hosts('tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'),
    link: (url) => {
      if (['vm.tiktok.com', 'vt.tiktok.com'].includes(url.hostname))
        return /^\/\w+\/?$/.test(url.pathname) ? `https://${url.hostname}${url.pathname}` : null;
      return /^\/(?:@[\w.-]+\/video\/\d+|share\/video\/\d+|embed\/\d+|t\/\w+)\/?$/.test(
        url.pathname,
      )
        ? `https://www.tiktok.com${url.pathname}`
        : null;
    },
    hint: 'Paste an individual TikTok video or share link. Profiles, collections and live streams are not supported.',
  },
  {
    service: 'soundcloud',
    name: 'SoundCloud',
    kind: 'audio',
    host: hosts('soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com'),
    link: (url) => {
      if (url.hostname === 'on.soundcloud.com')
        return /^\/[\w-]+\/?$/.test(url.pathname)
          ? `https://on.soundcloud.com${url.pathname}`
          : null;
      const match = /^\/([\w-]+)\/([\w-]+)\/?$/.exec(url.pathname);
      return match &&
        !['discover', 'you', 'search', 'stations', 'tags'].includes(match[1]) &&
        ![
          'sets',
          'tracks',
          'albums',
          'reposts',
          'likes',
          'spotlight',
          'comments',
          'followers',
          'following',
        ].includes(match[2])
        ? `https://soundcloud.com/${match[1]}/${match[2]}`
        : null;
    },
    hint: 'Paste an individual public SoundCloud track or share link. Profiles, sets and playlists are not supported.',
  },
  {
    service: 'vimeo',
    name: 'Vimeo',
    kind: 'video',
    host: hosts('vimeo.com', 'www.vimeo.com', 'player.vimeo.com'),
    link: (url) => {
      const path =
        url.hostname === 'player.vimeo.com' ? /^\/video\/\d+\/?$/ : /^\/\d+(?:\/[\da-f]+)?\/?$/;
      if (!path.test(url.pathname)) return null;
      const result = new URL(
        `https://${url.hostname === 'player.vimeo.com' ? 'player.vimeo.com' : 'vimeo.com'}${url.pathname}`,
      );
      if (url.searchParams.has('h')) result.searchParams.set('h', url.searchParams.get('h')!);
      return result.href;
    },
    hint: 'Paste an individual Vimeo video link. Profiles, showcases and channels are not supported.',
  },
  {
    service: 'dailymotion',
    name: 'Dailymotion',
    kind: 'video',
    host: hosts('dailymotion.com', 'www.dailymotion.com', 'dai.ly'),
    link: (url) => {
      const match = (
        url.hostname === 'dai.ly' ? /^\/([\da-z]+)\/?$/i : /^\/video\/([\da-z]+)(?:_[\w-]+)?\/?$/i
      ).exec(url.pathname);
      return match ? `https://www.dailymotion.com/video/${match[1]}` : null;
    },
    hint: 'Paste an individual Dailymotion video link. Playlists and channels are not supported.',
  },
  {
    service: 'bandcamp',
    name: 'Bandcamp',
    kind: 'audio',
    host: (host) => /^[\w-]+\.bandcamp\.com$/.test(host),
    link: (url) =>
      /^\/track\/[\w-]+\/?$/.test(url.pathname) ? `https://${url.hostname}${url.pathname}` : null,
    hint: 'Paste an individual Bandcamp track link. Albums and artist pages are not supported.',
  },
];

/** Known service links use yt-dlp; all other hosts retain direct-file import. */
export function onlineMedia(input: string): OnlineMedia | null {
  const youtube = youtubeVideo(input);
  if (youtube) return { service: 'youtube', name: 'YouTube', kind: 'video', url: youtube };
  const url = mediaUrl(input);
  const provider = providers.find((entry) => entry.host(url.hostname));
  if (!provider) return null;
  const link = provider.link(url);
  if (!link) throw new Error(provider.hint);
  return { service: provider.service, name: provider.name, kind: provider.kind, url: link };
}
export function downloadOptions(input: unknown, source: OnlineMedia): DownloadOptions {
  const defaults: DownloadOptions = { mode: source.kind, quality: '1080' };
  if (input === undefined) return defaults;
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Invalid media import options.');
  const value = (input as UrlImportOptions).media;
  if (value === undefined) return defaults;
  if (
    !value ||
    !['video', 'audio'].includes(value.mode) ||
    !['best', '1080', '720', '480'].includes(value.quality)
  )
    throw new Error('Invalid media import options.');
  return { mode: source.kind === 'audio' ? 'audio' : value.mode, quality: value.quality };
}
export function desktopImportMessage(source: OnlineMedia) {
  return `${source.name} imports are available in the Frame desktop app. On web, paste a direct audio or video file link.`;
}
