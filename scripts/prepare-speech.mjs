import { createHash } from 'node:crypto';
import { cp, mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
export async function verifySpeechModel(root = 'vendor/speech-models') {
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  if (manifest.model !== 'onnx-community/whisper-tiny' || !/^[a-f0-9]{40}$/.test(manifest.revision))
    throw new Error('Invalid speech model manifest.');
  for (const [name, entry] of Object.entries(manifest.files)) {
    if (!/^(?:onnx\/)?[a-z0-9_.-]+$/.test(name)) throw new Error('Invalid model file path.');
    const bytes = await readFile(join(root, manifest.model, name));
    if (
      bytes.length !== entry.size ||
      createHash('sha256').update(bytes).digest('hex') !== entry.sha256
    )
      throw new Error(
        `The bundled speech model is corrupt: ${name}. Restore vendor/speech-models from Git.`,
      );
  }
  return manifest;
}
export async function prepareSpeech() {
  const require = createRequire(import.meta.url),
    root = dirname(dirname(require.resolve('onnxruntime-web')));
  const manifest = await verifySpeechModel();
  const destination = join('public/models', manifest.revision, manifest.model);
  await mkdir(destination, { recursive: true });
  for (const name of Object.keys(manifest.files)) {
    await mkdir(dirname(join(destination, name)), { recursive: true });
    await cp(join('vendor/speech-models', manifest.model, name), join(destination, name));
  }
  await cp(
    'vendor/speech-models/LICENSE.txt',
    join('public/models', manifest.revision, 'LICENSE.txt'),
  );
  await mkdir('public/speech', { recursive: true });
  for (const name of [
    'ort-wasm-simd-threaded.mjs',
    'ort-wasm-simd-threaded.wasm',
    'ort-wasm-simd-threaded.jsep.mjs',
    'ort-wasm-simd-threaded.jsep.wasm',
  ])
    await cp(join(root, 'dist', name), join('public/speech', name));
}
