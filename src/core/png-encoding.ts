import { zlibSync } from 'fflate';
function crc32(bytes: Uint8Array) {
  let c = -1;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ -1) >>> 0;
}
function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(data.length + 12),
    view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(
    Uint8Array.from(type, (c) => c.charCodeAt(0)),
    4,
  );
  out.set(data, 8);
  view.setUint32(out.length - 4, crc32(out.subarray(4, out.length - 4)));
  return out;
}
/** Lossless RGB/RGBA encoding for decoder workers; no DOM or native imaging library needed. */
export function encodePixelsPng(
  width: number,
  height: number,
  pixels: Uint8Array | Uint8ClampedArray,
  channels = 4,
) {
  if (![3, 4].includes(channels) || pixels.length !== width * height * channels)
    throw new Error('Invalid decoded image pixels.');
  const header = new Uint8Array(13),
    view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = channels === 4 ? 6 : 2;
  const stride = width * channels,
    rows = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++)
    rows.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const parts = [
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', zlibSync(rows, { level: 6 })),
      chunk('IEND', new Uint8Array()),
    ],
    out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
