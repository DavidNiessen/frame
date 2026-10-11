import { expect, it } from 'vitest';
import { mediaUrl, remoteFilename } from '../src/core/remote-media';
import { downloadRemoteMedia } from '../src/engines/remote-download';
import { mediaServer } from './helpers/media-server';
import { probeFile } from '../electron/native';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

it('accepts only HTTP media URLs and derives safe filenames from headers, paths, or MIME', () => {
  for (const value of [
    '',
    'a song.mp3',
    'file:///tmp/a.mp3',
    'ftp://host/a.mp3',
    'https://user:password@host/a.mp3',
    {},
    null,
  ])
    expect(() => mediaUrl(value)).toThrow();
  expect(mediaUrl(' https://host/song.mp3?token=secret#fragment ').href).toBe(
    'https://host/song.mp3?token=secret',
  );
  const address = mediaUrl('https://host/path/download?token=secret');
  expect(remoteFilename(address, new Headers({ 'Content-Type': 'audio/flac' })).name).toBe(
    'download.flac',
  );
  expect(
    remoteFilename(
      address,
      new Headers({ 'Content-Disposition': "attachment; filename*=UTF-8''song%20%C3%BC.wav" }),
    ).name,
  ).toBe('song ü.wav');
  expect(
    remoteFilename(
      address,
      new Headers({ 'Content-Disposition': 'attachment; filename="../../CON.mp3"' }),
    ).name,
  ).toBe('Media_CON.mp3');
  expect(() =>
    remoteFilename(mediaUrl('https://host/page.mp4'), new Headers({ 'Content-Type': 'text/html' })),
  ).toThrow('page or playlist');
});
it('downloads real media, follows redirects, enforces streamed size limits, and aborts stalled responses', async () => {
  const server = await mediaServer();
  const controller = new AbortController(),
    chunks: Uint8Array[] = [];
  try {
    const result = await downloadRemoteMedia(server.url + '/download', {
      signal: controller.signal,
      onChunk: async (chunk) => {
        chunks.push(chunk);
      },
    });
    expect(result.name).toBe('A song ü.wav');
    expect(result.size).toBe(server.wav.length);
    expect(Buffer.concat(chunks)).toEqual(server.wav);
    expect(
      (
        await downloadRemoteMedia(server.url + '/redirect', {
          signal: controller.signal,
          onChunk: async () => {},
        })
      ).name,
    ).toBe('video.mp4');
    await expect(
      downloadRemoteMedia(server.url + '/missing.mp3', {
        signal: controller.signal,
        onChunk: async () => {},
      }),
    ).rejects.toThrow('HTTP 404');
    await expect(
      downloadRemoteMedia(server.url + '/page.mp4', {
        signal: controller.signal,
        onChunk: async () => {},
      }),
    ).rejects.toThrow('direct video or audio');
    await expect(
      downloadRemoteMedia(server.url + '/song.wav', {
        signal: controller.signal,
        maxBytes: 100,
        onChunk: async () => {},
      }),
    ).rejects.toThrow('exceeds');
    await expect(
      downloadRemoteMedia(server.url + '/slow.wav', {
        signal: controller.signal,
        maxBytes: 10,
        onChunk: async () => {},
      }),
    ).rejects.toThrow('exceeds');
    await expect(
      downloadRemoteMedia(server.url + '/slow.wav', {
        signal: controller.signal,
        onChunk: async () => {
          controller.abort();
        },
      }),
    ).rejects.toThrow('cancelled');
  } finally {
    await server.close();
  }
});
it('probes downloaded raw formats and rejects playlists disguised as supported files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-raw-probe-'));
  const server = await mediaServer();
  try {
    const wav = join(directory, 'raw.wav');
    await writeFile(wav, server.wav);
    expect((await probeFile(wav, { rawOnly: true })).kind).toBe('audio');
    const playlist = join(directory, 'playlist.mp4');
    await writeFile(
      playlist,
      '#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1.0,\n' +
        server.url +
        '/song.wav\n#EXT-X-ENDLIST\n',
    );
    await expect(probeFile(playlist, { rawOnly: true })).rejects.toThrow();
    expect(server.requests).not.toContain('/song.wav');
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
