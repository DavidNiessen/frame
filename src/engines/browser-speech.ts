import { speechModel, speechSamples, type TranscriptionOptions } from '../core/transcription';
import type { ExportProgress } from '../core/types';
import type { SubtitleCue } from '../core/subtitles';
export function browserSpeech() {
  let stop: (() => void) | undefined;
  return {
    cancel() {
      stop?.();
    },
    run(
      bytes: Uint8Array,
      options: TranscriptionOptions,
      progress: (value: ExportProgress) => void,
    ) {
      const samples = speechSamples(bytes),
        worker = new Worker(new URL('./speech-worker.ts', import.meta.url), { type: 'module' });
      return new Promise<SubtitleCue[]>((resolve, reject) => {
        const finish = () => {
          worker.terminate();
          stop = undefined;
        };
        stop = () => {
          finish();
          reject(new Error('Transcription cancelled.'));
        };
        worker.onerror = () => {
          finish();
          reject(new Error('Could not start the local speech model.'));
        };
        worker.onmessage = (event) => {
          if (event.data.progress) progress(event.data.progress);
          else if (event.data.error) {
            finish();
            reject(new Error(event.data.error));
          } else if (event.data.cues) {
            finish();
            resolve(event.data.cues);
          }
        };
        worker.postMessage(
          {
            samples: samples.buffer,
            options,
            modelRoot: new URL(`models/${speechModel.revision}/`, document.baseURI).href,
            wasmPath: new URL('speech/', document.baseURI).href,
          },
          [samples.buffer],
        );
      });
    },
  };
}
