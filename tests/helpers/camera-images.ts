import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ffmpegPath } from '../../electron/native';
import { writeExif, type ExifEntry } from '../../src/core/image-exif';
const text = (value: string) => new TextEncoder().encode(value);
const combine = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
const uint = (value: number, size = 4, little = false) => {
  const b = new Uint8Array(size),
    v = new DataView(b.buffer);
  if (size === 4) v.setUint32(0, value, little);
  else v.setUint16(0, value, little);
  return b;
};
/** Synthetic Bayer DNG: generated locally, with no borrowed photograph or embedded preview. */
export function cameraDng(width = 64, height = 48) {
  const raw = new Uint8Array(width * height * 2 + 8),
    view = new DataView(raw.buffer);
  raw.set([73, 73, 42, 0]);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      view.setUint16(
        8 + (y * width + x) * 2,
        Math.round(400 + (x / width) * 1000 + (y / height) * 500),
        true,
      );
  const number = (tag: number, values: number[], type = 4): ExifEntry => ({
      tag,
      type,
      count: values.length,
      data: combine(values.map((v) => uint(v, type === 3 ? 2 : 4, true))),
    }),
    byte = (tag: number, values: number[]): ExifEntry => ({
      tag,
      type: 1,
      count: values.length,
      data: Uint8Array.from(values),
    }),
    rational = (tag: number, values: number[], type = 5): ExifEntry => ({
      tag,
      type,
      count: values.length,
      data: combine(values.map((v) => combine([uint(v, 4, true), uint(1, 4, true)]))),
    });
  const name = text('Frame Synthetic DNG\0'),
    entries = [
      number(256, [width]),
      number(257, [height]),
      number(258, [16], 3),
      number(259, [1], 3),
      number(262, [32803], 3),
      number(273, [8]),
      number(277, [1], 3),
      number(278, [height]),
      number(279, [width * height * 2]),
      number(284, [1], 3),
      number(33421, [2, 2], 3),
      byte(33422, [0, 1, 1, 2]),
      byte(50706, [1, 4, 0, 0]),
      byte(50707, [1, 1, 0, 0]),
      { tag: 50708, type: 2, count: name.length, data: name },
      byte(50710, [0, 1, 2]),
      number(50711, [1], 3),
      rational(50714, [0]),
      number(50717, [4095]),
      rational(50721, [1, 0, 0, 0, 1, 0, 0, 0, 1], 10),
      rational(50728, [1, 1, 1]),
      number(50778, [21], 3),
    ];
  return writeExif(
    { camera: 'Frame', model: 'Synthetic DNG', author: 'Frame fixture' },
    raw,
    entries,
  );
}
const box = (name: string, payload: Uint8Array) =>
    combine([uint(payload.length + 8), text(name), payload]),
  full = (name: string, payload: Uint8Array, version = 0) =>
    box(name, combine([new Uint8Array([version, 0, 0, 0]), payload]));
/** Wrap an independently encoded HEVC still in a minimal HEIF container. */
export async function cameraHeic(directory: string) {
  const path = join(directory, 'hevc.mp4'),
    exec = promisify(execFile);
  await exec(ffmpegPath(), [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=64x48',
    '-frames:v',
    '1',
    '-c:v',
    'libx265',
    '-pix_fmt',
    'yuv420p',
    '-x265-params',
    'log-level=error:pools=1:frame-threads=1',
    '-tag:v',
    'hvc1',
    path,
  ]);
  const mp4 = new Uint8Array(await readFile(path)),
    view = new DataView(mp4.buffer, mp4.byteOffset, mp4.byteLength),
    index = (name: string) => Buffer.from(mp4).indexOf(name),
    configAt = index('hvcC'),
    config = mp4.slice(configAt - 4, configAt - 4 + view.getUint32(configAt - 4)),
    mdatAt = index('mdat'),
    pixels = mp4.slice(mdatAt + 4, mdatAt - 4 + view.getUint32(mdatAt - 4));
  const ftyp = box('ftyp', combine([text('heic'), uint(0), text('mif1heic')])),
    pitm = full('pitm', uint(1, 2)),
    infe = full('infe', combine([uint(1, 2), uint(0, 2), text('hvc1Frame fixture\0')]), 2),
    iinf = full('iinf', combine([uint(1, 2), infe])),
    ipco = box(
      'ipco',
      combine([
        config,
        full('ispe', combine([uint(64), uint(48)])),
        full('pixi', new Uint8Array([3, 8, 8, 8])),
      ]),
    ),
    ipma = full('ipma', combine([uint(1), uint(1, 2), new Uint8Array([3, 0x81, 0x82, 0x83])])),
    iprp = box('iprp', combine([ipco, ipma]));
  const makeMeta = (offset: number) =>
    full(
      'meta',
      combine([
        full('hdlr', combine([uint(0), text('pict'), new Uint8Array(12), text('Frame\0')])),
        pitm,
        iinf,
        full(
          'iloc',
          combine([
            new Uint8Array([0x44, 0]),
            uint(1, 2),
            uint(1, 2),
            uint(0, 2),
            uint(1, 2),
            uint(offset),
            uint(pixels.length),
          ]),
        ),
        iprp,
      ]),
    );
  const meta = makeMeta(0),
    final = makeMeta(ftyp.length + meta.length + 8);
  return combine([ftyp, final, box('mdat', pixels)]);
}
