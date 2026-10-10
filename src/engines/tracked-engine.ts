import type { MediaEngine } from '../core/types';
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
/** Track at the engine boundary, including background jobs and overlapping requests. */
export function trackedEngine(engine: MediaEngine): MediaEngine {
  const functions = new Map<PropertyKey, unknown>();
  return new Proxy(engine, { get(target, key, receiver) {
    const value = Reflect.get(target, key, receiver), label = labels[key as keyof MediaEngine];
    if (!label || typeof value !== 'function') return value;
    if (!functions.has(key)) functions.set(key, (...args: unknown[]) => loadingActivity.run(label, () => value.apply(target, args)));
    return functions.get(key);
  } });
}
