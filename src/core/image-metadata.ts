export interface ImageSourceMetadata {
  author?: string;
  copyright?: string;
  description?: string;
  camera?: string;
  model?: string;
  lens?: string;
  taken?: string;
  exposure?: number;
  aperture?: number;
  iso?: number;
  focalLength?: number;
  latitude?: number;
  longitude?: number;
}
export interface ImageMetadataOutput {
  keepCamera: boolean;
  keepLocation: boolean;
  author?: string;
  copyright?: string;
  description?: string;
}
export const defaultImageMetadata = (): ImageMetadataOutput => ({
  keepCamera: true,
  keepLocation: false,
});
export function parseImageMetadata(value: unknown): ImageMetadataOutput {
  if (value === undefined) return defaultImageMetadata();
  const v = value as ImageMetadataOutput;
  if (!v || typeof v.keepCamera !== 'boolean' || typeof v.keepLocation !== 'boolean')
    throw new Error('Invalid image metadata options.');
  const result = { keepCamera: v.keepCamera, keepLocation: v.keepLocation } as ImageMetadataOutput;
  for (const key of ['author', 'copyright', 'description'] as const) {
    if (v[key] !== undefined) {
      if (
        typeof v[key] !== 'string' ||
        v[key]!.length > 2000 ||
        /[\u0000-\u0008\u000b-\u001f]/.test(v[key]!)
      )
        throw new Error('Use image credits with up to 2,000 characters.');
      result[key] = v[key];
    }
  }
  return result;
}
export async function readImageMetadata(input: Uint8Array | Blob): Promise<ImageSourceMetadata> {
  try {
    const { parse } = await import('exifr');
    const head =
      input instanceof Uint8Array
        ? input.subarray(0, 12)
        : new Uint8Array(await input.slice(0, 12).arrayBuffer());
    if (
      String.fromCharCode(...head.subarray(0, 4)) === 'RIFF' &&
      String.fromCharCode(...head.subarray(8, 12)) === 'WEBP'
    ) {
      const bytes = input instanceof Uint8Array ? input : new Uint8Array(await input.arrayBuffer());
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let found = false;
      for (let offset = 12; offset + 8 <= bytes.length;) {
        const length = view.getUint32(offset + 4, true),
          end = offset + 8 + length;
        if (end > bytes.length) return {};
        if (String.fromCharCode(...bytes.subarray(offset, offset + 4)) === 'EXIF') {
          input = bytes.slice(offset + 8, end);
          if (String.fromCharCode(...input.subarray(0, 6)) === 'Exif\0\0') input = input.slice(6);
          found = true;
          break;
        }
        offset = end + (length & 1);
      }
      if (!found) return {};
    }
    const raw: Record<string, unknown> =
      (await parse(input, {
        reviveValues: false,
        translateValues: false,
        makerNote: false,
        userComment: false,
        ifd1: false,
        xmp: false,
        icc: false,
        iptc: false,
      })) ?? {};
    const result: ImageSourceMetadata = {};
    const strings = {
      author: 'Artist',
      copyright: 'Copyright',
      description: 'ImageDescription',
      camera: 'Make',
      model: 'Model',
      lens: 'LensModel',
      taken: 'DateTimeOriginal',
    } as const;
    for (const [key, tag] of Object.entries(strings)) {
      const value = raw[tag];
      if (typeof value === 'string')
        (result as Record<string, unknown>)[key] = value.replace(/\0/g, '').slice(0, 2000);
    }
    const numbers = {
      exposure: 'ExposureTime',
      aperture: 'FNumber',
      iso: 'ISO',
      focalLength: 'FocalLength',
      latitude: 'latitude',
      longitude: 'longitude',
    } as const;
    for (const [key, tag] of Object.entries(numbers)) {
      const value = raw[tag];
      if (typeof value === 'number' && Number.isFinite(value))
        (result as Record<string, unknown>)[key] = value;
    }
    return result;
  } catch {
    // Damaged or absent metadata must not prevent editing the pixels.
    return {};
  }
}
export function outputImageMetadata(
  source: ImageSourceMetadata | undefined,
  options: ImageMetadataOutput | undefined,
  keep: boolean,
): ImageSourceMetadata {
  const value = parseImageMetadata(options),
    result: ImageSourceMetadata = {};
  if (keep && source) {
    for (const key of ['author', 'copyright', 'description'] as const) result[key] = source[key];
    if (value.keepCamera)
      for (const key of [
        'camera',
        'model',
        'lens',
        'taken',
        'exposure',
        'aperture',
        'iso',
        'focalLength',
      ] as const)
        Object.assign(result, { [key]: source[key] });
    if (value.keepLocation) {
      result.latitude = source.latitude;
      result.longitude = source.longitude;
    }
  }
  for (const key of ['author', 'copyright', 'description'] as const)
    if (value[key] !== undefined) result[key] = value[key] || undefined;
  return result;
}
export const imageMetadataFormats = ['jpeg', 'png', 'webp', 'tiff'];
