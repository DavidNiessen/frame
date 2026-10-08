import type { MediaEngine } from '../core/types';
import './bridge';
export function createDesktopEngine(): MediaEngine {
  const bridge = window.frameDesktop!;
  return {
    platform: 'desktop',
    importFiles: files => bridge.importFiles(files),
    importSample: () => bridge.importSample(),
    async export(asset, settings, onProgress, batchToken) {
      const remove = bridge.onProgress(onProgress);
      try { return await bridge.export(asset.id, settings, batchToken); } finally { remove(); }
    },
    async thumbnails(asset, onProgress) {
      const remove = bridge.onProgress(onProgress);
      try { return URL.createObjectURL(new Blob([new Uint8Array(await bridge.thumbnails(asset.id))], { type: 'image/png' })); }
      finally { remove(); }
    },
    async waveform(asset, onProgress) {
      const remove = bridge.onProgress(onProgress);
      try { return await bridge.waveform(asset.id); } finally { remove(); }
    },
    beginBatch: () => bridge.beginBatch(),
    endBatch: token => bridge.endBatch(token),
    cancel: () => bridge.cancel(),
    release: asset => bridge.release(asset.id),
  };
}
