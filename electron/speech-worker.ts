import { parentPort, workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { runSpeechModel } from '../src/engines/speech-model';
import { speechSamples } from '../src/core/transcription';
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
      { modelRoot: workerData.modelRoot },
    );
    parentPort!.postMessage({ cues });
  } catch (error) {
    parentPort!.postMessage({ error: (error as Error).message });
  }
})();
