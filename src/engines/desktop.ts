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
    async merge(clips, settings, onProgress, transition) {
      const remove = bridge.onProgress(onProgress);
      try { return await bridge.merge(clips.map(c => ({ id: c.asset.id, edit: c.edit })), settings, transition); } finally { remove(); }
    },
    async previewFrame(asset, edit, time, onProgress) {
      const remove = bridge.onProgress(onProgress);
      try { return URL.createObjectURL(new Blob([new Uint8Array(await bridge.previewFrame(asset.id, edit, time))], { type: 'image/png' })); } finally { remove(); }
    },
    async previewAudio(asset, edit, onProgress) {
      const remove = bridge.onProgress(onProgress);
      try { return URL.createObjectURL(new Blob([new Uint8Array(await bridge.previewAudio(asset.id, edit))], { type: 'audio/wav' })); }
      finally { remove(); }
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
