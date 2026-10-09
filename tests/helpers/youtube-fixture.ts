import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ffmpegPath } from '../../electron/native';
const ffmpeg = ffmpegPath();

/** Recorded metadata with local streams exercises yt-dlp without contacting YouTube. */
export async function youtubeFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'frame-youtube-fixture-'));
  const files = new Map<string, Buffer>();
  for (const height of [360, 720]) {
    const path = join(directory, `video${height}.mp4`);
    await promisify(execFile)(ffmpeg!, ['-v', 'error', '-f', 'lavfi', '-i', `color=c=green:s=${height * 16 / 9}x${height}:r=10:d=1`, '-an', '-c:v', 'libx264', '-threads', '1', path]);
    files.set(`/video${height}.mp4`, await readFile(path));
  }
  const audio = join(directory, 'audio.m4a');
  await promisify(execFile)(ffmpeg!, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:a', 'aac', audio]);
  files.set('/audio.m4a', await readFile(audio));
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const route = request.url || ''; requests.push(route);
    const content = files.get(route);
    if (!content) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Length': content.length, 'Content-Type': route === '/audio.m4a' ? 'audio/mp4' : 'video/mp4' }); response.end(content);
  });
  await new Promise<void>(accept => server.listen(0, '127.0.0.1', accept));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const info = join(directory, 'fixture.info.json');
  const formats = [360, 720].map(height => ({ format_id: `v${height}`, url: `${url}/video${height}.mp4`, ext: 'mp4', protocol: 'http', width: height * 16 / 9, height, fps: 10, vcodec: 'avc1.64001f', acodec: 'none', filesize: files.get(`/video${height}.mp4`)!.length }));
  await writeFile(info, JSON.stringify({ id: 'BaW_jenozKc', title: 'YouTube fixture ü', extractor: 'youtube', extractor_key: 'Youtube', webpage_url: 'https://www.youtube.com/watch?v=BaW_jenozKc', duration: 1, is_live: false, formats: [...formats, { format_id: 'audio', url: url + '/audio.m4a', ext: 'm4a', protocol: 'http', vcodec: 'none', acodec: 'mp4a.40.2', abr: 128, filesize: files.get('/audio.m4a')!.length }] }));
  return { directory, info, requests, async close() { server.closeAllConnections(); await new Promise<void>(accept => server.close(() => accept())); await rm(directory, { recursive: true, force: true }); } };
}
