import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { Readable } from 'node:stream';

const mime: Record<string, string> = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.gif': 'image/gif',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.avif': 'image/avif',
};
/** Serve only paths resolved from imported asset/proxy IDs by the protocol handler. */
export async function mediaResponse(path: string, request: Request): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method))
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  const file = await stat(path).catch(() => null);
  if (!file?.isFile()) return new Response('Not found', { status: 404 });
  const headers = new Headers({
    'Content-Type': mime[extname(path).toLowerCase()] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
  });
  let start = 0,
    end = file.size - 1,
    status = 200;
  const range = request.headers.get('range');
  if (range && request.method !== 'HEAD') {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match && (match[1] || match[2])) {
      if (!match[1]) {
        const suffix = Number(match[2]);
        start = Math.max(0, file.size - suffix);
      } else {
        start = Number(match[1]);
        end = match[2] ? Math.min(end, Number(match[2])) : end;
      }
    }
    if (
      !match ||
      !(match[1] || match[2]) ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start >= file.size ||
      end < start
    ) {
      headers.set('Content-Range', `bytes */${file.size}`);
      return new Response(null, { status: 416, headers });
    }
    status = 206;
    headers.set('Content-Range', `bytes ${start}-${end}/${file.size}`);
  }
  headers.set('Content-Length', String(end - start + 1));
  if (request.method === 'HEAD' || file.size === 0) return new Response(null, { status, headers });
  const stream = createReadStream(path, { start, end, signal: request.signal });
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status, headers });
}
