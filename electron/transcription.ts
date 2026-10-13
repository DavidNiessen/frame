import { app, net, type IpcMainInvokeEvent } from 'electron';
import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import { analysisDataArgs } from '../src/core/analysis-data';
import { speechModel, parseTranscriptionOptions } from '../src/core/transcription';
import type { SubtitleCue } from '../src/core/subtitles';
import { parseEdit } from '../src/core/project';
import { resolveAudioLayers } from '../src/core/audio-layers';
import type { SessionAssets } from './media-session';
import type { MediaJobs } from './jobs';
import type { WindowIpc } from './window-ipc';
import { withResources } from './resources';
import { runFfmpeg } from './native';
export function registerTranscription(
  assets: SessionAssets,
  jobs: MediaJobs,
  trusted: (event: IpcMainInvokeEvent) => void,
  ipc: WindowIpc,
) {
  ipc.handle('media:transcribe', (event, id: string, value: unknown, rawOptions: unknown) => {
    trusted(event);
    const source = assets.get(id);
    if (!source) throw new Error('Import the source again.');
    const edit = parseEdit(value, source.asset),
      options = parseTranscriptionOptions(rawOptions, edit);
    const progress = (value: { ratio: number; message?: string }) => {
      if (!event.sender.isDestroyed()) event.sender.send('media:progress', value);
    };
    return jobs.run(async (execute) =>
      withResources(
        [edit],
        async ([paths], directory) => {
          const input = join(directory, 'speech.wav'),
            layers = resolveAudioLayers(edit, [...assets.values()]);
          await execute(
            runFfmpeg(
              analysisDataArgs(
                source.asset,
                edit,
                { ...options, kind: 'speech' },
                source.path,
                input,
                paths,
                layers,
              ),
              options.end - options.start,
              (ratio) => progress({ ratio, message: 'Preparing speech audio…' }),
            ),
          );
          jobs.signal.throwIfAborted();
          const worker = new Worker(join(__dirname, 'speech-worker.cjs'), {
              workerData: {
                input,
                options,
                cacheDir: join(app.getPath('userData'), 'speech-models'),
              },
            }),
            signal = jobs.signal;
          try {
            return await new Promise<SubtitleCue[]>((resolve, reject) => {
              const abort = () => reject(new Error('Transcription cancelled.'));
              signal.addEventListener('abort', abort, { once: true });
              const timer = setTimeout(
                () => reject(new Error('Transcription timed out. Try a shorter selection.')),
                10 * 60 * 1000,
              );
              const cleanup = () => {
                clearTimeout(timer);
                signal.removeEventListener('abort', abort);
              };
              worker.once('error', (error) => {
                cleanup();
                reject(error);
              });
              worker.once('exit', () => {
                cleanup();
                reject(new Error('The speech worker stopped unexpectedly.'));
              });
              worker.on('message', async (value) => {
                if (value.progress) {
                  progress(value.progress);
                  return;
                }
                if (value.cues) {
                  cleanup();
                  resolve(value.cues);
                  return;
                }
                if (value.error) {
                  cleanup();
                  reject(new Error(value.error));
                  return;
                }
                if (value.request) {
                  const request = value.request;
                  try {
                    const prefix = `https://huggingface.co/${speechModel.id}/resolve/${speechModel.revision}/`;
                    if (typeof request.url !== 'string' || !request.url.startsWith(prefix))
                      throw new Error('Unsupported speech model download.');
                    const response = await net.fetch(request.url, { signal });
                    const chunks: Uint8Array[] = [];
                    let length = 0;
                    const reader = response.body?.getReader();
                    if (!reader) throw new Error('Empty model response.');
                    while (true) {
                      const { done, value: chunk } = await reader.read();
                      if (done) break;
                      length += chunk.length;
                      if (length > 50 * 1024 * 1024) {
                        await reader.cancel();
                        throw new Error('Speech model file exceeds its download limit.');
                      }
                      chunks.push(chunk);
                    }
                    const bytes = new Uint8Array(length);
                    let offset = 0;
                    for (const chunk of chunks) {
                      bytes.set(chunk, offset);
                      offset += chunk.length;
                    }
                    worker.postMessage(
                      {
                        id: request.id,
                        bytes: bytes.buffer,
                        status: response.status,
                        headers: Object.fromEntries(response.headers),
                      },
                      [bytes.buffer],
                    );
                  } catch (error) {
                    if (!signal.aborted)
                      worker.postMessage({ id: request.id, error: (error as Error).message });
                  }
                }
              });
            });
          } finally {
            await worker.terminate();
          }
        },
        [source.asset],
        [...assets.values()],
      ),
    );
  });
}
