import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';

export async function mediaServer() {
  const directory = await mkdtemp(join(tmpdir(), 'frame-url-server-')), path = join(directory, 'tone.wav');
  await promisify(execFile)(ffmpeg!, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', path]);
  const wav = await readFile(path), video = await readFile('public/sample.mp4');
  const requests: string[] = [];
  let slowClosed = false;
  const server = createServer((request, response) => {
    const route = new URL(request.url!, 'http://localhost').pathname;
    requests.push(route);
    if (route !== '/no-cors.wav') { response.setHeader('Access-Control-Allow-Origin', '*'); response.setHeader('Access-Control-Expose-Headers', 'Content-Disposition'); }
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (route === '/redirect') { response.writeHead(302, { Location: '/video.mp4' }); response.end(); return; }
    if (route === '/page.mp4') { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<h1>This is a page</h1>'); return; }
    if (route === '/missing.mp3') { response.writeHead(404); response.end(); return; }
    if (route === '/broken.wav') { response.writeHead(200, { 'Content-Type': 'audio/wav' }); response.end('Not media'); return; }
    if (route === '/too-large.wav') { response.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': 600 * 1024 * 1024 }); response.flushHeaders(); return; }
    if (route === '/slow.wav') {
      response.writeHead(200, { 'Content-Type': 'audio/wav' }); response.write(wav.subarray(0, 64));
      response.on('close', () => { slowClosed = true; }); return;
    }
    if (route === '/download') response.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent('A song ü.wav'));
    const isVideo = route === '/video.mp4';
    response.writeHead(200, { 'Content-Type': isVideo ? 'video/mp4' : 'audio/wav', 'Content-Length': isVideo ? video.length : wav.length });
    response.end(isVideo ? video : wav);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  return { url: `http://127.0.0.1:${address.port}`, wav, requests, get slowClosed() { return slowClosed; },
    close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); } };
}
