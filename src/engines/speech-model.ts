import { env, pipeline } from '@huggingface/transformers';
import {
  speechModel,
  transcriptionCues,
  type SpeechChunk,
  type TranscriptionOptions,
} from '../core/transcription';
import type { ExportProgress } from '../core/types';
/** Shared model configuration; native workers use CPU, browser workers use WASM. No media leaves the device. */
export async function runSpeechModel(
  samples: Float32Array,
  options: TranscriptionOptions,
  progress: (value: ExportProgress) => void,
  config: { cacheDir?: string; wasmPath?: string },
) {
  env.allowLocalModels = false;
  if (config.cacheDir) {
    env.cacheDir = config.cacheDir;
    env.useBrowserCache = false;
  }
  if (config.wasmPath) {
    env.useFSCache = false;
    env.backends.onnx.wasm!.wasmPaths = config.wasmPath;
    env.backends.onnx.wasm!.numThreads = 1;
    env.backends.onnx.wasm!.proxy = false;
  }
  progress({ ratio: 0, message: 'Loading local speech model…' });
  const transcriber = await pipeline('automatic-speech-recognition', speechModel.id, {
    revision: speechModel.revision,
    dtype: 'q8',
    device: config.wasmPath ? 'wasm' : 'cpu',
    session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
    progress_callback: (value) => {
      if (value.status === 'progress') progress({ ratio: 0, message: 'Downloading speech model…' });
    },
  });
  const chunks: SpeechChunk[] = [];
  try {
    // Bound inference memory, retain context around boundaries, and publish real chunk progress.
    const seconds = samples.length / 16000;
    for (let begin = 0; begin < seconds; begin += 26) {
      const from = Math.max(0, begin - 2),
        to = Math.min(seconds, begin + 28),
        clip = samples.subarray(Math.floor(from * 16000), Math.floor(to * 16000));
      let energy = 0;
      for (let i = 0; i < clip.length; i++) energy += clip[i] * clip[i];
      if (Math.sqrt(energy / clip.length) > 0.001) {
        const result = await transcriber(clip, {
          return_timestamps: true,
          task: 'transcribe',
          ...(options.language === 'auto' ? {} : { language: options.language }),
        });
        const output = Array.isArray(result) ? result[0] : result;
        for (const chunk of output.chunks ?? []) {
          const [a, b] = chunk.timestamp as [number | null, number | null],
            start = (a ?? 0) + from,
            end = (b ?? to - from) + from,
            center = (start + end) / 2;
          if (center >= begin && (center < begin + 26 || begin + 26 >= seconds))
            chunks.push({ text: chunk.text, timestamp: [start, Math.min(seconds, end)] });
        }
      }
      progress({
        ratio: Math.min(1, (begin + 26) / seconds),
        message: 'Transcribing speech on your device…',
      });
    }
    return transcriptionCues(chunks, options.start, seconds);
  } finally {
    await transcriber.dispose();
  }
}
