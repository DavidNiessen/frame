import { FFmpeg } from '@ffmpeg/ffmpeg';

/** Each runtime owns a WASM worker and filesystem; background work cannot cancel exports. */
export function browserRuntime() {
  let instance: FFmpeg | null = null, loading: Promise<FFmpeg> | null = null;
  function cancel() { instance?.terminate(); instance = null; loading = null; }
  function ready(): Promise<FFmpeg> {
    if (loading) return loading;
    if (!window.isSecureContext || !crossOriginIsolated) return Promise.reject(new Error('Browser processing needs a secure page with cross-origin isolation. Check the hosting instructions, or use the desktop app.'));
    const worker = new FFmpeg(); instance = worker;
    loading = worker.load({ coreURL: new URL('ffmpeg/ffmpeg-core.js', document.baseURI).href, wasmURL: new URL('ffmpeg/ffmpeg-core.wasm', document.baseURI).href })
      .then(() => worker).catch(error => { if (instance === worker) cancel(); throw error; });
    return loading;
  }
  return { ready, cancel };
}
