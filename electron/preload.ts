import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { DesktopBridge } from '../src/engines/bridge';
const bridge: DesktopBridge = {
  shellIntegrationStatus: () => ipcRenderer.invoke('desktop:shell-status'),
  setShellIntegration: enabled => ipcRenderer.invoke('desktop:set-shell-actions', enabled),
  nextLaunch: () => ipcRenderer.invoke('desktop:next-launch'),
  importLaunch: id => ipcRenderer.invoke('desktop:import-launch', id),
  onLaunchAvailable: callback => { const listener = () => callback(); ipcRenderer.on('desktop:launch-available', listener); return () => ipcRenderer.removeListener('desktop:launch-available', listener); },
  desktopCapabilities: () => ipcRenderer.invoke('media:capabilities'),
  previewProxy: id => ipcRenderer.invoke('media:proxy', id),
  releaseProxy: id => ipcRenderer.invoke('media:release-proxy', id),
  importFiles: files => ipcRenderer.invoke('media:import', files?.map(file => webUtils.getPathForFile(file))),
  importFolder: () => ipcRenderer.invoke('media:import-folder'),
  importSample: () => ipcRenderer.invoke('media:sample'),
  export: (id, settings, token) => ipcRenderer.invoke('media:export', id, settings, token),
  saveProject: project => ipcRenderer.invoke('project:save', project),
  merge: (clips, settings, transition) => ipcRenderer.invoke('media:merge', clips, settings, transition),
  detectSilence: (id, options) => ipcRenderer.invoke('media:silence', id, options),
  previewFrame: (id, edit, time) => ipcRenderer.invoke('media:frame-preview', id, edit, time),
  previewAudio: (id, edit) => ipcRenderer.invoke('media:audio-preview', id, edit),
  thumbnails: id => ipcRenderer.invoke('media:thumbnails', id),
  waveform: id => ipcRenderer.invoke('media:waveform', id),
  beginBatch: options => ipcRenderer.invoke('batch:begin', options),
  endBatch: token => ipcRenderer.invoke('batch:end', token),
  openBatchFolder: () => ipcRenderer.invoke('batch:open-folder'),
  cancel: () => ipcRenderer.send('media:cancel'),
  release: id => ipcRenderer.invoke('media:release', id),
  onProgress: callback => {
    const listener = (_event: unknown, progress: Parameters<typeof callback>[0]) => callback(progress);
    ipcRenderer.on('media:progress', listener);
    return () => ipcRenderer.removeListener('media:progress', listener);
  },
};
contextBridge.exposeInMainWorld('frameDesktop', bridge);
