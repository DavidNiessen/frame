import { imageMetadataFormats, outputImageMetadata } from './image-metadata';
import { writeExif, tiffPixelEntries } from './image-exif';
import { frameDimensions } from './geometry';
import type { EditSettings, MediaAsset } from './types';
const ascii = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));
const join = (parts: Uint8Array[]) => {
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
};
function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}
function pngChunk(type: string, data: Uint8Array) {
  const bytes = new Uint8Array(data.length + 12),
    view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  bytes.set(ascii(type), 4);
  bytes.set(data, 8);
  view.setUint32(bytes.length - 4, crc32(bytes.subarray(4, bytes.length - 4)));
  return bytes;
}
function png(bytes: Uint8Array, exif: Uint8Array | undefined) {
  const parts = [bytes.slice(0, 8)],
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 8; offset < bytes.length;) {
    const length = view.getUint32(offset),
      end = offset + length + 12;
    if (end > bytes.length) throw new Error('Invalid exported PNG chunk.');
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (!['eXIf', 'tEXt', 'iTXt', 'zTXt'].includes(type)) parts.push(bytes.slice(offset, end));
    if (type === 'IHDR' && exif) parts.push(pngChunk('eXIf', exif));
    offset = end;
  }
  return join(parts);
}
function jpeg(bytes: Uint8Array, exif: Uint8Array | undefined) {
  const parts = [bytes.slice(0, 2)];
  if (exif) {
    const payload = join([ascii('Exif\0\0'), exif]),
      header = new Uint8Array(4);
    header.set([255, 225]);
    new DataView(header.buffer).setUint16(2, payload.length + 2);
    parts.push(header, payload);
  }
  for (let offset = 2; offset < bytes.length;) {
    const marker = bytes[offset + 1];
    if (marker === 218 || marker === 217) {
      parts.push(bytes.slice(offset));
      break;
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3],
      end = offset + length + 2;
    if (bytes[offset] !== 255 || length < 2 || end > bytes.length)
      throw new Error('Invalid exported JPEG segment.');
    if (![225, 237, 254].includes(marker)) parts.push(bytes.slice(offset, end));
    offset = end;
  }
  return join(parts);
}
function webpChunk(type: string, data: Uint8Array) {
  const bytes = new Uint8Array(8 + data.length + (data.length & 1));
  bytes.set(ascii(type));
  new DataView(bytes.buffer).setUint32(4, data.length, true);
  bytes.set(data, 8);
  return bytes;
}
function webp(bytes: Uint8Array, exif: Uint8Array | undefined, width: number, height: number) {
  const parts: Uint8Array[] = [],
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let extended = false,
    alpha = false;
  for (let offset = 12; offset < bytes.length;) {
    const length = view.getUint32(offset + 4, true),
      end = offset + 8 + length + (length & 1);
    if (end > bytes.length) throw new Error('Invalid exported WebP chunk.');
    const type = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    if (type === 'VP8X') {
      const chunk = bytes.slice(offset, end);
      chunk[8] = (chunk[8] & ~0x0c) | (exif ? 0x08 : 0);
      parts.push(chunk);
      extended = true;
    } else if (!['EXIF', 'XMP '].includes(type)) parts.push(bytes.slice(offset, end));
    if (type === 'ALPH' || (type === 'VP8L' && !!(bytes[offset + 12] & 0x10))) alpha = true;
    offset = end;
  }
  if (exif && !extended) {
    const data = new Uint8Array(10);
    data[0] = 0x08 | (alpha ? 0x10 : 0);
    for (let i = 0; i < 3; i++) {
      data[4 + i] = ((width - 1) >>> (i * 8)) & 255;
      data[7 + i] = ((height - 1) >>> (i * 8)) & 255;
    }
    parts.unshift(webpChunk('VP8X', data));
  }
  if (exif) parts.push(webpChunk('EXIF', exif));
  const header = join([ascii('RIFF'), new Uint8Array(4), ascii('WEBP')]),
    result = join([header, ...parts]);
  new DataView(result.buffer).setUint32(4, result.length - 8, true);
  return result;
}
function tiff(bytes: Uint8Array, metadata: Parameters<typeof writeExif>[0]) {
  const entries = tiffPixelEntries(bytes),
    little = bytes[0] === 73;
  const offsets = entries.find((e) => e.tag === 273 || e.tag === 324),
    counts = entries.find((e) => e.tag === 279 || e.tag === 325);
  if (!offsets || !counts || offsets.count !== counts.count)
    throw new Error('Invalid exported TIFF pixel strips.');
  const values = (entry: typeof offsets) => {
    const view = new DataView(entry.data.buffer, entry.data.byteOffset, entry.data.byteLength);
    return Array.from({ length: entry.count }, (_, i) =>
      entry.type === 3 ? view.getUint16(i * 2, little) : view.getUint32(i * 4, little),
    );
  };
  const sizes = values(counts),
    positions = values(offsets),
    pixelParts = [bytes.slice(0, 8)],
    rewritten = new Uint8Array(offsets.count * 4),
    positionView = new DataView(rewritten.buffer);
  let next = 8;
  positions.forEach((at, i) => {
    if (at + sizes[i] > bytes.length) throw new Error('Invalid exported TIFF strip size.');
    positionView.setUint32(i * 4, next, little);
    pixelParts.push(bytes.slice(at, at + sizes[i]));
    next += sizes[i];
  });
  offsets.type = 4;
  offsets.data = rewritten;
  return writeExif(metadata, join(pixelParts), entries);
}
/** Inject only selected metadata after encoding; keep encoded pixels and color profiles intact. */
export function writeImageMetadata(
  bytes: Uint8Array,
  asset: MediaAsset,
  edit: EditSettings,
): Uint8Array {
  if (asset.kind !== 'image' || !imageMetadataFormats.includes(edit.format)) return bytes;
  const metadata = outputImageMetadata(asset.imageMetadata, edit.imageMetadata, edit.keepMetadata),
    populated = Object.values(metadata).some((v) => v !== undefined);
  const exif = populated ? writeExif(metadata) : undefined;
  if (edit.format === 'jpeg') return jpeg(bytes, exif);
  if (edit.format === 'png') return png(bytes, exif);
  if (edit.format === 'tiff') return tiff(bytes, metadata);
  const dimensions = frameDimensions(asset, edit);
  return webp(bytes, exif, dimensions.width, dimensions.height);
}
