import type { MediaEngine } from '../core/types';
import './bridge';
export function createDesktopEngine(): MediaEngine {
  const bridge = window.frameDesktop!;
  return {
    platform: 'desktop',
    saveWorkspace: (document, ids) => bridge.saveWorkspace(document, ids),
    discardWorkspace: () => bridge.discardWorkspace(),
    async recoverWorkspace(progress) {
      const remove = bridge.onProgress(progress);
      try {
        return await bridge.recoverWorkspace();
      } finally {
        remove();
      }
    },
    async importLaunch(id, onProgress) {
      const remove = bridge.onProgress(onProgress ?? (() => {}));
      try {
        return await bridge.importLaunch(id);
      } finally {
        remove();
      }
    },
    async desktopCapabilities(onProgress) {
      const remove = bridge.onProgress(onProgress);
      try {
        return await bridge.desktopCapabilities();
      } finally {
        remove();
      }
    },
    async previewProxy(asset, onProgress) {
      const remove = bridge.onProgress(onProgress);
      try {
        return await bridge.previewProxy(asset.id);
      } finally {
        remove();
      }
    },
    releaseProxy: (id) => bridge.releaseProxy(id),
    async joinedPreview(asset, ranges, progress) {
      const remove = bridge.onJoinedPreviewProgress(progress);
      try {
        return await bridge.joinedPreview(asset.id, ranges);
      } finally {
        remove();
      }
    },
    async effectPreview(asset, edit, progress) {
      const remove = bridge.onJoinedPreviewProgress(progress);
      try {
        return await bridge.effectPreview(asset.id, edit);
      } finally {
        remove();
      }
    },
    cancelJoinedPreview: () => bridge.cancelJoinedPreview(),
    async importFiles(files, onProgress) {
      const remove = bridge.onProgress(onProgress ?? (() => {}));
      try {
        return await bridge.importFiles(files);
      } finally {
        remove();
      }
    },
    async importFolder(onProgress) {
      const remove = bridge.onProgress(onProgress ?? (() => {}));
      try {
        return await bridge.importFolder();
      } finally {
        remove();
      }
    },
    async importUrl(url, onProgress, options) {
      const remove = bridge.onProgress(onProgress ?? (() => {}));
      try {
        return await bridge.importUrl(url, options);
      } finally {
        remove();
      }
    },
    async export(asset, settings, onProgress, batchToken) {
      const remove = bridge.onProgress(onProgress);
      try {
        return await bridge.export(asset.id, settings, batchToken);
      } finally {
        remove();
      }
    },
    async merge(clips, settings, onProgress, transition) {
      const remove = bridge.onProgress(onProgress);
      try {
        return await bridge.merge(
          clips.map((c) => ({ id: c.asset.id, edit: c.edit })),
          settings,
          transition,
        );
      } finally {
        remove();
      }
    },
    async appendVideo(base, source, progress) {
      const remove = bridge.onProgress(progress);
      try {
        return await bridge.appendVideo(base.id, source.id);
      } finally {
        remove();
      }
    },
    async extractAudio(asset, progress) {
      const remove = bridge.onProgress(progress);
      try {
        return await bridge.extractAudio(asset.id);
      } finally {
        remove();
      }
    },
    async detectSilence(asset, options, onProgress) {
      const remove = bridge.onProgress(onProgress);
      try {
        return await bridge.detectSilence(asset.id, options);
      } finally {
        remove();
      }
    },
    async previewFrame(asset, edit, time, onProgress) {
      const remove = bridge.onProgress(onProgress);
      try {
        return URL.createObjectURL(
          new Blob([new Uint8Array(await bridge.previewFrame(asset.id, edit, time))], {
            type: 'image/png',
          }),
        );
      } finally {
        remove();
      }
    },
    async previewAudio(asset, edit, onProgress) {
      const remove = bridge.onProgress(onProgress);
      try {
        return URL.createObjectURL(
          new Blob([new Uint8Array(await bridge.previewAudio(asset.id, edit))], {
            type: 'audio/wav',
          }),
        );
      } finally {
        remove();
      }
    },
    async measureLoudness(asset, edit, onProgress) {
      const remove = bridge.onProgress(onProgress);
      try {
        return await bridge.measureLoudness(asset.id, edit);
      } finally {
        remove();
      }
    },
    async detectScenes(asset, options, onProgress) {
      const remove = bridge.onProgress(onProgress);
      try {
        return await bridge.detectScenes(asset.id, options);
      } finally {
        remove();
      }
    },
    async contactSheet(asset, edit, options, onProgress) {
      const remove = bridge.onProgress(onProgress);
      try {
        return URL.createObjectURL(
          new Blob([new Uint8Array(await bridge.contactSheet(asset.id, edit, options))], {
            type: 'image/png',
          }),
        );
      } finally {
        remove();
      }
    },
    async waveform(asset, onProgress) {
      const remove = bridge.onWaveformProgress(onProgress);
      try {
        return await bridge.waveform(asset.id);
      } finally {
        remove();
      }
    },
    beginBatch: (options) => bridge.beginBatch(options),
    endBatch: (token) => bridge.endBatch(token),
    openBatchFolder: () => bridge.openBatchFolder(),
    cancel: () => bridge.cancel(),
    release: (asset) => bridge.release(asset.id),
  };
}
