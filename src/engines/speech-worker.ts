import { runSpeechModel } from './speech-model';
self.onmessage = async (event) => {
  try {
    const cues = await runSpeechModel(
      new Float32Array(event.data.samples),
      event.data.options,
      (progress) => self.postMessage({ progress }),
      { modelRoot: event.data.modelRoot, wasmPath: event.data.wasmPath },
    );
    self.postMessage({ cues });
  } catch (error) {
    self.postMessage({ error: (error as Error).message });
  }
};
