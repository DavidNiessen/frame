import type { ExportProgress, MediaEngine } from '../core/types';
import { loadingActivity } from '../core/loading-activity';
const labels: Partial<Record<keyof MediaEngine, string>> = {
  beginBatch: 'Preparing conversion…', endBatch: 'Finishing conversion…', thumbnails: 'Preparing images…',
  importFiles: 'Reading your files…', importFolder: 'Reading your folder…', importLaunch: 'Reading selected files…', importUrl: 'Downloading media…',
  recoverWorkspace: 'Reopening workspace…', saveWorkspace: 'Saving workspace…', discardWorkspace: 'Clearing workspace…',
  export: 'Exporting media…', merge: 'Joining media…', appendVideo: 'Inserting video…', extractAudio: 'Extracting audio…',
  waveform: 'Preparing waveforms…', joinedPreview: 'Preparing continuous playback…', effectPreview: 'Updating effects preview…',
  previewFrame: 'Rendering frame…', previewAudio: 'Rendering audio…', previewProxy: 'Preparing playback…',
  detectScenes: 'Detecting scenes…', detectSilence: 'Detecting silence…', measureLoudness: 'Measuring loudness…', contactSheet: 'Preparing contact sheet…', desktopCapabilities: 'Checking encoders…',
};
const progressIndex: Partial<Record<keyof MediaEngine, number>> = {
  importFiles: 1, importFolder: 0, importLaunch: 1, importUrl: 1, recoverWorkspace: 0,
  export: 2, merge: 2, appendVideo: 2, extractAudio: 1, waveform: 1, thumbnails: 1,
  joinedPreview: 2, effectPreview: 2, previewFrame: 3, previewAudio: 2, previewProxy: 1,
  detectScenes: 2, detectSilence: 2, measureLoudness: 2, contactSheet: 3, desktopCapabilities: 0,
};
const background = new Set<keyof MediaEngine>(['waveform', 'joinedPreview', 'effectPreview']);
const cancelLabels: Partial<Record<keyof MediaEngine, string>> = {
  export: 'Cancel export', merge: 'Cancel merge', importUrl: 'Cancel download', appendVideo: 'Cancel insertion', extractAudio: 'Cancel extraction',
  waveform: 'Cancel waveform', joinedPreview: 'Cancel preview', effectPreview: 'Cancel preview', previewFrame: 'Cancel rendering',
  previewAudio: 'Cancel audio preview', previewProxy: 'Cancel proxy', detectScenes: 'Cancel scan', detectSilence: 'Cancel detection',
  measureLoudness: 'Cancel measurement', contactSheet: 'Cancel generation', desktopCapabilities: 'Cancel processing',
};
/** Track at the engine boundary, including background jobs and overlapping requests. */
export function trackedEngine(engine: MediaEngine): MediaEngine {
  const functions = new Map<PropertyKey, unknown>();
  return new Proxy(engine, { get(target, key, receiver) {
    const value = Reflect.get(target, key, receiver), label = labels[key as keyof MediaEngine];
    if (!label || typeof value !== 'function') return value;
    if (!functions.has(key)) functions.set(key, async (...args: unknown[]) => {
      const method = key as keyof MediaEngine, index = progressIndex[method], cancelLabel = cancelLabels[method];
      let cancelled = false;
      const interrupt = !cancelLabel ? undefined : method === 'waveform' ? () => target.cancelWaveform?.()
        : method === 'joinedPreview' || method === 'effectPreview' ? () => target.cancelJoinedPreview?.() : () => target.cancel();
      const cancel = interrupt && (() => { cancelled = true; interrupt(); });
      const owner = loadingActivity.start(label, { priority: background.has(method) ? 5 : index === undefined ? 0 : 20, cancel, cancelLabel });
      if (index !== undefined) {
        const original = args[index] as ((progress: ExportProgress) => void) | undefined;
        args[index] = (progress: ExportProgress) => { owner.update({ ratio: progress.ratio, message: progress.message }); original?.(progress); };
      }
      try { return await value.apply(target, args); }
      catch (error) { if (cancelled && method === 'waveform') throw new Error('Waveform generation cancelled.'); throw error; }
      finally { owner.finish(); }
    });
    return functions.get(key);
  } });
}
