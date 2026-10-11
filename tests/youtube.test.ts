import { expect, it } from 'vitest';
import { youtubeOptions, youtubeVideo } from '../src/core/youtube';
import { youtubeArgs, youtubeFailure } from '../electron/youtube-plan';
import { runYoutubeDownloader } from '../electron/youtube-process';
import { youtubeFixture } from './helpers/youtube-fixture';
import { probeFile, ffmpegPath } from '../electron/native';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const require = createRequire(import.meta.url);

it('recognizes only individual YouTube videos, strips playlist/tracking options, and validates import choices', () => {
  const expected = 'https://www.youtube.com/watch?v=BaW_jenozKc';
  for (const url of [
    'https://youtu.be/BaW_jenozKc?t=4',
    expected + '&list=PL123',
    'https://m.youtube.com/shorts/BaW_jenozKc',
    'https://www.youtube-nocookie.com/embed/BaW_jenozKc',
    'https://www.youtube.com/live/BaW_jenozKc',
  ])
    expect(youtubeVideo(url)).toBe(expected);
  for (const url of [
    'https://youtube.com/playlist?list=PL123',
    'https://youtube.com/@channel',
    'https://youtu.be/invalid',
  ])
    expect(() => youtubeVideo(url)).toThrow('individual');
  expect(youtubeVideo('https://youtube.com.evil.test/watch?v=BaW_jenozKc')).toBeNull();
  expect(youtubeOptions(undefined)).toEqual({ mode: 'video', quality: '1080' });
  expect(() => youtubeOptions({ youtube: { mode: 'video', quality: '9999' } })).toThrow();
  expect(
    youtubeFailure('ERROR: Sign in to confirm you are not a bot. https://secret?token=123'),
  ).not.toContain('secret');
});
it('uses the portable downloader and Electron runtime to download, limit quality, merge, and import audio-only streams', async () => {
  const fixture = await youtubeFixture();
  const binary = resolve(
      'build/media-tools',
      process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp',
    ),
    runtime = require('electron');
  try {
    for (const { mode, quality } of [
      { mode: 'video', quality: '480' },
      { mode: 'video', quality: 'best' },
      { mode: 'audio', quality: '480' },
    ] as const) {
      fixture.requests.length = 0;
      const directory = join(fixture.directory, `${mode}-${quality}`);
      await mkdir(directory);
      const args = youtubeArgs(
        'https://www.youtube.com/watch?v=BaW_jenozKc',
        directory,
        ffmpegPath(),
        runtime,
        { mode, quality },
      )
        .slice(0, -2)
        .concat('--load-info-json', fixture.info);
      const progress: string[] = [];
      const path = await runYoutubeDownloader(
        binary,
        args,
        directory,
        mode,
        new AbortController().signal,
        (value) => progress.push(value.message),
      );
      const media = await probeFile(path, { rawOnly: true });
      expect(media.kind).toBe(mode === 'audio' ? 'audio' : 'video');
      expect(media.hasAudio).toBe(true);
      if (mode === 'video') expect(media.height).toBe(quality === 'best' ? 720 : 360);
      expect(progress.at(-1)).toBe('Download complete. Reading media…');
      if (quality !== 'best') expect(fixture.requests).not.toContain('/video720.mp4');
      if (mode === 'video' && quality === '480') {
        const { stderr } = await promisify(execFile)(binary, [...args, '--verbose', '--simulate'], {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PATH: '' },
        });
        const version = /JS runtimes: node-(\d+)\./.exec(stderr);
        expect(Number(version?.[1])).toBeGreaterThanOrEqual(22);
        expect(stderr).toContain('yt_dlp_ejs-');
      }
    }
  } finally {
    await fixture.close();
  }
}, 60000);
it('cancels the downloader process tree and rejects outputs outside its temporary directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-youtube-cancel-'));
  try {
    const tick = join(directory, 'ticks');
    const grandchild = `const fs=require('fs');process.on('SIGTERM',()=>{});setInterval(()=>fs.appendFileSync(${JSON.stringify(tick)},'.'),20)`;
    const script = `const {spawn}=require('child_process');spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'ignore'});process.on('SIGTERM',()=>{});setTimeout(()=>console.log('FRAME_PROGRESS:{"downloaded":1,"total":10}'),200);setInterval(()=>{},100)`;
    const controller = new AbortController();
    await expect(
      runYoutubeDownloader(
        process.execPath,
        ['-e', script],
        directory,
        'video',
        controller.signal,
        () => controller.abort(),
      ),
    ).rejects.toThrow('cancelled');
    const before = await readFile(tick, 'utf8');
    await new Promise((accept) => setTimeout(accept, 200));
    expect(await readFile(tick, 'utf8')).toBe(before);
    const outside = join(directory, 'outside.mp4');
    await writeFile(outside, 'fake');
    const owned = join(directory, 'owned');
    await mkdir(owned);
    await expect(
      runYoutubeDownloader(
        process.execPath,
        ['-e', `console.log('FRAME_FILE:'+JSON.stringify(${JSON.stringify(outside)}))`],
        owned,
        'video',
        new AbortController().signal,
        () => {},
      ),
    ).rejects.toThrow('supported media file');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
