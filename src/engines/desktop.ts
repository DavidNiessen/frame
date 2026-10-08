import type { MediaEngine } from '../core/types';
import './bridge';
export function createDesktopEngine(): MediaEngine {
  const bridge = window.frameDesktop!;
  return {
    platform: 'desktop',
    importFiles: files => bridge.importFiles(files),
    importSample: () => bridge.importSample(),
    async export(asset, settings, onProgress) {
      const remove = bridge.onProgress(onProgress);
      try { return await bridge.export(asset.id, settings); } finally { remove(); }
    },
    cancel: () => bridge.cancel(),
    release: asset => bridge.release(asset.id),
  };
}
