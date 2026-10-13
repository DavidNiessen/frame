import { MAX_PORTABLE_IMAGE_BYTES, validateDecodedImage } from './image-decoders';
import { encodePixelsPng } from './png-encoding';
import type { ImageSourceMetadata } from './image-metadata';
interface RawMetadata {
  width: number;
  height: number;
  camera_make: string;
  camera_model: string;
  artist: string;
  desc: string;
  timestamp: number;
  iso_speed: number;
  shutter: number;
  aperture: number;
  focal_len: number;
}
interface RawInstance {
  open: (bytes: Uint8Array, options: object) => void;
  metadata: (full: boolean) => RawMetadata;
  imageData: () => {
    width: number;
    height: number;
    colors: number;
    bits: number;
    data: Uint8Array;
  };
  delete: () => void;
}
interface HeifImage {
  get_width: () => number;
  get_height: () => number;
  is_primary: () => boolean;
  free: () => void;
  display: (
    pixels: { data: Uint8ClampedArray; width: number; height: number },
    done: (pixels: { data: Uint8ClampedArray } | null) => void,
  ) => void;
}
interface HeifDecoder {
  decode: (bytes: Uint8Array) => HeifImage[];
  decoder?: number;
}
export type DecoderFactory = (
  options?: object,
) =>
  | Promise<{ LibRaw: new () => RawInstance }>
  | { HeifDecoder: new () => HeifDecoder; heif_context_free: (pointer: number) => void };
export async function decodePortableImage(
  bytes: Uint8Array,
  kind: 'raw' | 'heif',
  factory: DecoderFactory,
  wasm?: Uint8Array,
) {
  if (bytes.length > MAX_PORTABLE_IMAGE_BYTES)
    throw new Error('HEIC and RAW images are limited to 128 MB per file.');
  if (kind === 'raw') {
    const module = (await factory({ wasmBinary: wasm })) as { LibRaw: new () => RawInstance },
      raw = new module.LibRaw();
    try {
      raw.open(bytes, { outputBps: 8, outputColor: 1, useCameraWb: true });
      const meta = raw.metadata(false);
      validateDecodedImage(meta.width, meta.height);
      const pixels = raw.imageData();
      validateDecodedImage(pixels.width, pixels.height);
      if (pixels.bits !== 8 || pixels.colors !== 3)
        throw new Error('This RAW file could not be developed into an RGB image.');
      const metadata: ImageSourceMetadata = {
        camera: meta.camera_make,
        model: meta.camera_model,
        author: meta.artist,
        description: meta.desc,
      };
      for (const [key, value] of [
        ['iso', meta.iso_speed],
        ['exposure', meta.shutter],
        ['aperture', meta.aperture],
        ['focalLength', meta.focal_len],
      ] as const)
        if (Number.isFinite(value) && value > 0) metadata[key] = value;
      if (meta.timestamp > 0)
        metadata.taken = new Date(meta.timestamp * 1000)
          .toISOString()
          .slice(0, 19)
          .replaceAll('-', ':')
          .replace('T', ' ');
      return {
        width: pixels.width,
        height: pixels.height,
        bytes: encodePixelsPng(pixels.width, pixels.height, pixels.data, 3),
        metadata,
      };
    } finally {
      raw.delete();
    }
  }
  const module = (await factory()) as {
      HeifDecoder: new () => HeifDecoder;
      heif_context_free: (pointer: number) => void;
    },
    decoder = new module.HeifDecoder();
  let images: HeifImage[] = [];
  try {
    images = decoder.decode(bytes);
    const image = images.find((image) => image.is_primary()) ?? images[0];
    if (!image) throw new Error('This HEIC image is damaged or uses an unsupported codec.');
    const width = image.get_width(),
      height = image.get_height();
    validateDecodedImage(width, height);
    const pixels = await new Promise<Uint8ClampedArray>((resolve, reject) =>
      image.display({ data: new Uint8ClampedArray(width * height * 4), width, height }, (result) =>
        result ? resolve(result.data) : reject(new Error('Could not decode this HEIC image.')),
      ),
    );
    return {
      width,
      height,
      bytes: encodePixelsPng(width, height, pixels),
      metadata: {} as ImageSourceMetadata,
    };
  } finally {
    for (const image of images) image.free();
    if (decoder.decoder) module.heif_context_free(decoder.decoder);
  }
}
