import { parentPort, workerData } from 'node:worker_threads';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { decodePortableImage, type DecoderFactory } from '../src/core/portable-image-decode';
const { input, output, kind, root } = workerData as {
  input: string;
  output: string;
  kind: 'raw' | 'heif';
  root: string;
};
void (async () => {
  try {
    const module = await import(
        pathToFileURL(join(root, kind === 'raw' ? 'libraw.mjs' : 'libheif.mjs')).href
      ),
      wasm = kind === 'raw' ? new Uint8Array(await readFile(join(root, 'libraw.wasm'))) : undefined,
      result = await decodePortableImage(
        new Uint8Array(await readFile(input)),
        kind,
        module.default as DecoderFactory,
        wasm,
      );
    await writeFile(output, result.bytes);
    parentPort?.postMessage({ metadata: result.metadata });
  } catch (error) {
    parentPort?.postMessage({ error: (error as Error).message });
  }
})();
