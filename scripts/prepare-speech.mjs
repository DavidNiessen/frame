import { cp, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
export async function prepareSpeech() {
  const require = createRequire(import.meta.url),
    root = dirname(dirname(require.resolve('onnxruntime-web')));
  await mkdir('public/speech', { recursive: true });
  for (const name of [
    'ort-wasm-simd-threaded.mjs',
    'ort-wasm-simd-threaded.wasm',
    'ort-wasm-simd-threaded.jsep.mjs',
    'ort-wasm-simd-threaded.jsep.wasm',
  ])
    await cp(join(root, 'dist', name), join('public/speech', name));
}
