import type { ImageSourceMetadata } from './image-metadata';
export interface ExifEntry {
  tag: number;
  type: number;
  count: number;
  data: Uint8Array;
}
const utf8 = new TextEncoder();
const text = (tag: number, value: string): ExifEntry => {
  const data = utf8.encode(value + '\0');
  return { tag, type: 2, count: data.length, data };
};
const number = (tag: number, value: number, little: boolean, short = false): ExifEntry => {
  const data = new Uint8Array(short ? 2 : 4),
    view = new DataView(data.buffer);
  if (short) view.setUint16(0, value, little);
  else view.setUint32(0, value, little);
  return { tag, type: short ? 3 : 4, count: 1, data };
};
const rational = (tag: number, values: number[], little: boolean): ExifEntry => {
  const data = new Uint8Array(values.length * 8),
    view = new DataView(data.buffer);
  for (let i = 0; i < values.length; i++) {
    view.setUint32(i * 8, Math.round(values[i] * 1_000_000), little);
    view.setUint32(i * 8 + 4, 1_000_000, little);
  }
  return { tag, type: 5, count: values.length, data };
};
export function writeExif(
  source: ImageSourceMetadata,
  prefix?: Uint8Array,
  baseEntries: ExifEntry[] = [],
): Uint8Array {
  const little = !prefix || prefix[0] === 0x49;
  const primary = [...baseEntries, number(274, 1, little, true)],
    camera: ExifEntry[] = [],
    gps: ExifEntry[] = [];
  const tags = {
    author: 315,
    copyright: 33432,
    description: 270,
    camera: 271,
    model: 272,
  } as const;
  for (const [key, tag] of Object.entries(tags)) {
    const value = source[key as keyof typeof tags];
    if (value) primary.push(text(tag, value));
  }
  if (source.lens) camera.push(text(42036, source.lens));
  if (source.taken) camera.push(text(36867, source.taken));
  for (const [key, tag] of [
    ['exposure', 33434],
    ['aperture', 33437],
    ['focalLength', 37386],
  ] as const) {
    const value = source[key];
    if (value !== undefined && value >= 0 && value < 4000)
      camera.push(rational(tag, [value], little));
  }
  if (source.iso !== undefined && source.iso >= 0 && source.iso < 65536)
    camera.push(number(34855, source.iso, little, true));
  if (
    Number.isFinite(source.latitude) &&
    Number.isFinite(source.longitude) &&
    Math.abs(source.latitude!) <= 90 &&
    Math.abs(source.longitude!) <= 180
  ) {
    const degrees = (v: number) => {
      const x = Math.abs(v),
        d = Math.floor(x),
        m = Math.floor((x - d) * 60);
      return [d, m, ((x - d) * 60 - m) * 60];
    };
    gps.push(
      { tag: 0, type: 1, count: 4, data: new Uint8Array([2, 3, 0, 0]) },
      text(1, source.latitude! < 0 ? 'S' : 'N'),
      rational(2, degrees(source.latitude!), little),
      text(3, source.longitude! < 0 ? 'W' : 'E'),
      rational(4, degrees(source.longitude!), little),
    );
  }
  if (camera.length) primary.push(number(34665, 0, little));
  if (gps.length) primary.push(number(34853, 0, little));
  const start = prefix ? (prefix.length + 1) & ~1 : 8;
  const size = (entries: ExifEntry[]) => 6 + entries.length * 12;
  const cameraOffset = start + size(primary),
    gpsOffset = cameraOffset + (camera.length ? size(camera) : 0);
  let extra = gpsOffset + (gps.length ? size(gps) : 0);
  const all = [...primary, ...camera, ...gps];
  const total =
    extra +
    all.reduce((sum, entry) => sum + (entry.data.length > 4 ? (entry.data.length + 1) & ~1 : 0), 0);
  const bytes = new Uint8Array(total),
    view = new DataView(bytes.buffer);
  if (prefix) bytes.set(prefix);
  else {
    bytes.set(little ? [73, 73] : [77, 77]);
    view.setUint16(2, 42, little);
  }
  view.setUint32(4, start, little);
  const directory = (entries: ExifEntry[], offset: number) => {
    entries.sort((a, b) => a.tag - b.tag);
    view.setUint16(offset, entries.length, little);
    entries.forEach((entry, index) => {
      const p = offset + 2 + index * 12;
      view.setUint16(p, entry.tag, little);
      view.setUint16(p + 2, entry.type, little);
      view.setUint32(p + 4, entry.count, little);
      if (entry.tag === 34665) view.setUint32(p + 8, cameraOffset, little);
      else if (entry.tag === 34853) view.setUint32(p + 8, gpsOffset, little);
      else if (entry.data.length <= 4) bytes.set(entry.data, p + 8);
      else {
        view.setUint32(p + 8, extra, little);
        bytes.set(entry.data, extra);
        extra += (entry.data.length + 1) & ~1;
      }
    });
    // The exported image is one frame; omit source thumbnails and next-page directories.
    view.setUint32(offset + 2 + entries.length * 12, 0, little);
  };
  directory(primary, start);
  if (camera.length) directory(camera, cameraOffset);
  if (gps.length) directory(gps, gpsOffset);
  return bytes;
}
export function tiffPixelEntries(bytes: Uint8Array): ExifEntry[] {
  const little = bytes[0] === 73,
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    offset = view.getUint32(4, little),
    count = view.getUint16(offset, little);
  const sizes = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];
  // Preserve decoding tags, not arbitrary metadata or pointers into a previous EXIF tree.
  const pixelTags = new Set([
    254, 256, 257, 258, 259, 262, 266, 273, 277, 278, 279, 284, 317, 320, 322, 323, 324, 325, 338,
    339, 347, 529, 530, 531, 532, 34675,
  ]);
  const entries: ExifEntry[] = [];
  for (let i = 0; i < count; i++) {
    const p = offset + 2 + i * 12,
      tag = view.getUint16(p, little),
      type = view.getUint16(p + 2, little),
      count = view.getUint32(p + 4, little),
      length = count * (sizes[type] ?? 0);
    if (!pixelTags.has(tag) || !length) continue;
    const at = length > 4 ? view.getUint32(p + 8, little) : p + 8;
    if (at + length > bytes.length) throw new Error('Invalid exported TIFF directory.');
    entries.push({ tag, type, count, data: bytes.slice(at, at + length) });
  }
  return entries;
}
