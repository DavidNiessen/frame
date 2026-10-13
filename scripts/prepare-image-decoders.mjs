import { cp, mkdir } from 'node:fs/promises';
export async function prepareImageDecoders() {
  await mkdir('public/image-decoders', { recursive: true });
  for (const [source, destination] of [
    ['libraw-wasm/dist/libraw.js', 'libraw.mjs'],
    ['libraw-wasm/dist/libraw.wasm', 'libraw.wasm'],
    ['libraw-wasm/dist/libraw.js.map', 'libraw.js.map'],
    ['libheif-js/libheif-wasm/libheif-bundle.mjs', 'libheif.mjs'],
  ])
    await cp(`node_modules/${source}`, `public/image-decoders/${destination}`);
}
