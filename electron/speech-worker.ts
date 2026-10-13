import { parentPort, workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { runSpeechModel } from '../src/engines/speech-model';
import { speechSamples } from '../src/core/transcription';
let serial = 0;
const pending = new Map<
  number,
  { resolve: (response: Response) => void; reject: (error: Error) => void }
>();
// Electron's network service honors system proxy and certificate settings. Only model GETs cross this bridge.
globalThis.fetch = (input) =>
  new Promise((resolve, reject) => {
    const id = ++serial;
    pending.set(id, { resolve, reject });
    parentPort!.postMessage({ request: { id, url: String(input) } });
  });
parentPort!.on('message', (value) => {
  const job = pending.get(value.id);
  if (!job) return;
  pending.delete(value.id);
  if (value.error) job.reject(new Error(value.error));
  else job.resolve(new Response(value.bytes, { status: value.status, headers: value.headers }));
});
void (async () => {
  try {
    if (workerData.probe) {
      parentPort!.postMessage({ ready: true });
      return;
    }
    const cues = await runSpeechModel(
      speechSamples(new Uint8Array(await readFile(workerData.input))),
      workerData.options,
      (progress) => parentPort!.postMessage({ progress }),
      { cacheDir: workerData.cacheDir },
    );
    parentPort!.postMessage({ cues });
  } catch (error) {
    parentPort!.postMessage({ error: (error as Error).message });
  }
})();
