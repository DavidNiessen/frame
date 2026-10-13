import { beforeAll, afterAll, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cameraDng, cameraHeic } from './helpers/camera-images';
import { decodePortableImage, type DecoderFactory } from '../src/core/portable-image-decode';
import { isImageFilename, isMediaFilename } from '../src/core/imports';
import { readImageMetadata } from '../src/core/image-metadata';
import { validateDecodedImage, portableImageKind } from '../src/core/image-decoders';
import { probeFile } from '../electron/native';
let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'frame-camera-'));
});
afterAll(async () => rm(dir, { recursive: true, force: true }));
it.each(['raw', 'heif'] as const)(
  'develops a real %s image through the portable decoder with original metadata',
  async (kind) => {
    const bytes = kind === 'raw' ? cameraDng() : await cameraHeic(dir),
      moduleUrl = pathToFileURL(
        resolve('public/image-decoders', kind === 'raw' ? 'libraw.mjs' : 'libheif.mjs'),
      ).href,
      module = await import(/* @vite-ignore */ moduleUrl),
      wasm =
        kind === 'raw'
          ? new Uint8Array(await readFile('public/image-decoders/libraw.wasm'))
          : undefined;
    const result = await decodePortableImage(bytes, kind, module.default as DecoderFactory, wasm),
      path = join(dir, `${kind}.png`);
    await writeFile(path, result.bytes);
    const asset = await probeFile(path);
    expect(asset.kind).toBe('image');
    expect(asset.width).toBe(64);
    expect(asset.height).toBe(48);
    expect(result.bytes.length).toBeGreaterThan(100);
    if (kind === 'raw') {
      expect(result.metadata.model).toBe('Synthetic DNG');
      expect((await readImageMetadata(bytes)).author).toBe('Frame fixture');
    }
  },
  30000,
);
it('recognizes HEIC and common camera RAW formats as image sources', () => {
  for (const name of [
    'Photo.HEIC',
    'Frame.CR2',
    'Frame.cr3',
    'Frame.NEF',
    'Frame.ARW',
    'Frame.RAF',
    'Frame.DNG',
    'Frame.RW2',
  ]) {
    expect(isImageFilename(name)).toBe(true);
    expect(isMediaFilename(name)).toBe(true);
    expect(portableImageKind(name)).not.toBeNull();
  }
  expect(portableImageKind('photo.png')).toBeNull();
});
it('bounds decoded pixels before allocating them', () => {
  expect(() => validateDecodedImage(640, 480)).not.toThrow();
  expect(() => validateDecodedImage(12000, 9000)).toThrow();
  expect(() => validateDecodedImage(1e9, 1)).toThrow();
  expect(() => validateDecodedImage(NaN, 100)).toThrow();
});
