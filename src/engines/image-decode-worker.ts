import { decodePortableImage, type DecoderFactory } from '../core/portable-image-decode';
self.onmessage = async (
  event: MessageEvent<{ bytes: Uint8Array; kind: 'raw' | 'heif'; base: string }>,
) => {
  try {
    const { bytes, kind, base } = event.data,
      moduleUrl = new URL(kind === 'raw' ? 'libraw.mjs' : 'libheif.mjs', base).href,
      module = await import(/* @vite-ignore */ moduleUrl),
      wasm =
        kind === 'raw'
          ? new Uint8Array(await (await fetch(new URL('libraw.wasm', base))).arrayBuffer())
          : undefined,
      result = await decodePortableImage(bytes, kind, module.default as DecoderFactory, wasm);
    self.postMessage({ result }, { transfer: [result.bytes.buffer] });
  } catch (error) {
    self.postMessage({ error: (error as Error).message });
  }
};
