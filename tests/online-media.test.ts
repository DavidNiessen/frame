import { expect, it } from 'vitest';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { onlineMedia, downloadOptions } from '../src/core/online-media';
import { onlineMediaArgs, onlineMediaFailure } from '../electron/online-media-plan';
import { runOnlineMediaDownloader } from '../electron/online-media-process';
import { probeFile, ffmpegPath } from '../electron/native';
import { youtubeFixture } from './helpers/youtube-fixture';
const require = createRequire(import.meta.url);

it.each([
  [
    'https://www.instagram.com/artist.name/reel/Cx123_Ab/?igsh=tracking',
    'Instagram',
    'video',
    'https://www.instagram.com/reel/Cx123_Ab/',
  ],
  [
    'https://www.instagram.com/reel/Cx123_Ab/?igsh=tracking',
    'Instagram',
    'video',
    'https://www.instagram.com/reel/Cx123_Ab/',
  ],
  [
    'https://instagram.com/reels/Cx123_Ab',
    'Instagram',
    'video',
    'https://www.instagram.com/reel/Cx123_Ab/',
  ],
  [
    'https://www.tiktok.com/@artist/video/123456789?is_from_webapp=1',
    'TikTok',
    'video',
    'https://www.tiktok.com/@artist/video/123456789',
  ],
  ['https://vm.tiktok.com/ZAb123/', 'TikTok', 'video', 'https://vm.tiktok.com/ZAb123/'],
  ['https://vt.tiktok.com/ZAb123/', 'TikTok', 'video', 'https://vt.tiktok.com/ZAb123/'],
  ['https://www.tiktok.com/t/ZAb123', 'TikTok', 'video', 'https://www.tiktok.com/t/ZAb123'],
  [
    'https://m.soundcloud.com/artist/song?si=tracking',
    'SoundCloud',
    'audio',
    'https://soundcloud.com/artist/song',
  ],
  ['https://on.soundcloud.com/Ab123', 'SoundCloud', 'audio', 'https://on.soundcloud.com/Ab123'],
  ['https://vimeo.com/12345/abcdef?share=copy', 'Vimeo', 'video', 'https://vimeo.com/12345/abcdef'],
  [
    'https://player.vimeo.com/video/12345?h=abcdef&badge=0',
    'Vimeo',
    'video',
    'https://player.vimeo.com/video/12345?h=abcdef',
  ],
  [
    'https://dai.ly/x123ab?share=copy',
    'Dailymotion',
    'video',
    'https://www.dailymotion.com/video/x123ab',
  ],
  [
    'https://artist.bandcamp.com/track/a-song?from=search',
    'Bandcamp',
    'audio',
    'https://artist.bandcamp.com/track/a-song',
  ],
])('recognizes individual service link %s', (input, name, kind, url) => {
  expect(onlineMedia(input)).toMatchObject({ name, kind, url });
});
it('rejects profiles, playlists, unsupported schemes and embedded credentials without allowing lookalike hosts', () => {
  for (const url of [
    'https://instagram.com/artist/',
    'https://instagram.com/stories/artist/123/',
    'https://instagram.com/reels/audio/123/',
    'https://tiktok.com/@artist',
    'https://tiktok.com/@artist/collection/songs-123',
    'https://tiktok.com/@artist/live',
    'https://soundcloud.com/artist',
    'https://soundcloud.com/artist/sets/album',
    'https://soundcloud.com/artist/likes',
    'https://vimeo.com/showcase/123',
    'https://dailymotion.com/playlist/123',
    'https://artist.bandcamp.com/album/an-album',
    'file:///tmp/a.mp4',
    'https://user:password@instagram.com/reel/abc/',
  ])
    expect(() => onlineMedia(url)).toThrow();
  for (const url of [
    'https://instagram.com.evil.test/reel/abc/',
    'https://evil-bandcamp.com/track/song',
    'https://cdn.example.com/audio.mp3',
  ])
    expect(onlineMedia(url)).toBeNull();
});
it('uses audio mode for music services and rejects malformed IPC options', () => {
  const source = onlineMedia('https://soundcloud.com/artist/song')!;
  expect(downloadOptions(undefined, source)).toEqual({ mode: 'audio', quality: '1080' });
  expect(downloadOptions({ media: { mode: 'video', quality: 'best' } }, source).mode).toBe('audio');
  for (const options of [
    null,
    [],
    { media: null },
    { media: { mode: 'other', quality: 'best' } },
    { media: { mode: 'audio', quality: '4k' } },
  ])
    expect(() => downloadOptions(options, source)).toThrow('Invalid media import options');
  for (const log of [
    'login required: token=private',
    'HTTP Error 429: token=private',
    'removed token=private',
  ])
    expect(onlineMediaFailure(log, source)).not.toContain('token=private');
  expect(onlineMediaFailure('login required', source)).toContain('SoundCloud track');
});
it('downloads silent videos and extracts audio from muxed social videos using the bundled tools', async () => {
  const fixture = await youtubeFixture();
  const original = JSON.parse(await readFile(fixture.info, 'utf8'));
  const binary = resolve(
    'build/media-tools',
    process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp',
  );
  try {
    for (const [name, link, mode, formats, hasAudio] of [
      ['instagram', 'https://instagram.com/reel/abc/', 'video', [original.formats[0]], false],
      [
        'tiktok',
        'https://tiktok.com/@artist/video/123',
        'audio',
        [
          {
            ...original.formats[0],
            url: original.formats[0].url.replace('video360.mp4', 'muxed.mp4'),
            acodec: 'mp4a.40.2',
            filesize: undefined,
          },
        ],
        true,
      ],
      [
        'soundcloud',
        'https://soundcloud.com/artist/song',
        'audio',
        [original.formats.at(-1)],
        true,
      ],
      [
        'bandcamp',
        'https://artist.bandcamp.com/track/song',
        'audio',
        [original.formats.at(-1)],
        true,
      ],
    ] as const) {
      const source = onlineMedia(link)!;
      const directory = join(fixture.directory, name);
      await mkdir(directory);
      const info = join(fixture.directory, name + '.json');
      await writeFile(info, JSON.stringify({ ...original, title: name + ' fixture', formats }));
      const args = onlineMediaArgs(source.url, directory, ffmpegPath(), require('electron'), {
        mode,
        quality: 'best',
      })
        .slice(0, -2)
        .concat('--load-info-json', info);
      const path = await runOnlineMediaDownloader(
        binary,
        args,
        directory,
        mode,
        new AbortController().signal,
        () => {},
        source,
      );
      const result = await probeFile(path, { rawOnly: true });
      expect(result.kind).toBe(mode);
      expect(result.hasAudio).toBe(hasAudio);
      expect(dirname(path)).toBe(await realpath(directory));
    }
    fixture.requests.length = 0;
    const directory = join(fixture.directory, 'playlist');
    await mkdir(directory);
    const info = join(fixture.directory, 'playlist.json');
    await writeFile(
      info,
      JSON.stringify({
        _type: 'playlist',
        id: 'collection',
        title: 'Collection',
        entries: [original, { ...original, id: 'second' }],
      }),
    );
    const source = onlineMedia('https://on.soundcloud.com/abc')!;
    const args = onlineMediaArgs(
      source.url,
      directory,
      ffmpegPath(),
      require('electron'),
      downloadOptions(undefined, source),
    )
      .slice(0, -2)
      .concat('--load-info-json', info);
    await expect(
      runOnlineMediaDownloader(
        binary,
        args,
        directory,
        'audio',
        new AbortController().signal,
        () => {},
        source,
      ),
    ).rejects.toThrow('playlists');
    expect(fixture.requests).toEqual([]);
  } finally {
    await fixture.close();
  }
}, 60000);
it('selects the requested short-edge quality for portrait Reels using the bundled downloader', async () => {
  const fixture = await youtubeFixture();
  const original = JSON.parse(await readFile(fixture.info, 'utf8'));
  const binary = resolve(
    'build/media-tools',
    process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp',
  );
  try {
    const info = join(fixture.directory, 'portrait.json');
    await writeFile(info, JSON.stringify({ ...original, formats: fixture.portraitFormats }));
    const source = onlineMedia('https://instagram.com/reel/abc/')!;
    for (const quality of ['720', '1080'] as const) {
      const directory = join(fixture.directory, 'portrait-' + quality);
      await mkdir(directory);
      const args = onlineMediaArgs(source.url, directory, ffmpegPath(), require('electron'), {
        mode: 'video',
        quality,
      })
        .slice(0, -2)
        .concat('--load-info-json', info);
      const path = await runOnlineMediaDownloader(
        binary,
        args,
        directory,
        'video',
        new AbortController().signal,
        () => {},
        source,
      );
      const result = await probeFile(path, { rawOnly: true });
      expect(result.width).toBe(Number(quality));
      expect(result.height).toBe((Number(quality) * 16) / 9);
    }
  } finally {
    await fixture.close();
  }
}, 60000);
it('uses the terminal download error instead of recoverable warning text', () => {
  const source = onlineMedia('https://soundcloud.com/artist/song')!;
  expect(
    onlineMediaFailure(
      'WARNING: hls_mp3 format not found\nERROR: This video is DRM protected',
      source,
    ),
  ).toContain('DRM protection');
  expect(
    onlineMediaFailure(
      'WARNING: cookies unavailable\nERROR: Requested format is not available',
      source,
    ),
  ).toContain('Try Best available');
  expect(onlineMediaFailure('ERROR: HTTP Error 404', source)).toContain('unavailable');
});
