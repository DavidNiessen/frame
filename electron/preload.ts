import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { DesktopBridge } from '../src/engines/bridge';
const bridge: DesktopBridge = {
  installedFonts: () => ipcRenderer.invoke('desktop:fonts'),
  saveWorkspace: (document, ids) => ipcRenderer.invoke('workspace:save', document, ids),
  recoverWorkspace: () => ipcRenderer.invoke('workspace:recover'),
  discardWorkspace: () => ipcRenderer.invoke('workspace:clear'),
  exportHistory: () => ipcRenderer.invoke('history:status'),
  clearExportHistory: () => ipcRenderer.invoke('history:clear'),
  removeExportHistory: id => ipcRenderer.invoke('history:remove', id),
  revealExport: id => ipcRenderer.invoke('history:reveal', id),
  watchFoldersStatus: () => ipcRenderer.invoke('watch:status'),
  chooseWatchFolders: () => ipcRenderer.invoke('watch:choose'),
  addWatchFolder: draft => ipcRenderer.invoke('watch:add', draft),
  setWatchFolderEnabled: (id, enabled) => ipcRenderer.invoke('watch:enabled', id, enabled),
  removeWatchFolder: id => ipcRenderer.invoke('watch:remove', id),
  retryWatchFolder: id => ipcRenderer.invoke('watch:retry', id),
  openWatchFolderOutput: id => ipcRenderer.invoke('watch:open', id),
  notificationPreference: () => ipcRenderer.invoke('desktop:notification-preference'),
  setCompletionNotifications: enabled => ipcRenderer.invoke('desktop:set-notifications', enabled),
  notifyCompletion: summary => ipcRenderer.invoke('desktop:notify-completion', summary),
  miniConversion: process.argv.includes('--frame-mini-conversion'),
  windowState: () => ipcRenderer.invoke('desktop:window-state'),
  setWindowChrome: expanded => ipcRenderer.invoke('desktop:window-chrome', expanded),
  windowAction: action => ipcRenderer.invoke('desktop:window-action', action),
  onWindowState: callback => {
    const listener = (_event: unknown, state: Parameters<typeof callback>[0]) => callback(state);
    ipcRenderer.on('desktop:window-state', listener);
    return () => ipcRenderer.removeListener('desktop:window-state', listener);
  },
  setMiniExpanded: (expanded, reducedMotion) => ipcRenderer.invoke('desktop:mini-expanded', expanded, reducedMotion),
  finishMini: () => ipcRenderer.invoke('desktop:mini-finish'),
  dismissMini: () => ipcRenderer.invoke('desktop:mini-dismiss'),
  shellIntegrationStatus: () => ipcRenderer.invoke('desktop:shell-status'),
  setShellIntegration: enabled => ipcRenderer.invoke('desktop:set-shell-actions', enabled),
  changeShellCertificate: action => ipcRenderer.invoke('desktop:shell-certificate', action),
  nextLaunch: () => ipcRenderer.invoke('desktop:next-launch'),
  importLaunch: id => ipcRenderer.invoke('desktop:import-launch', id),
  onLaunchAvailable: callback => { const listener = () => callback(); ipcRenderer.on('desktop:launch-available', listener); return () => ipcRenderer.removeListener('desktop:launch-available', listener); },
  desktopCapabilities: () => ipcRenderer.invoke('media:capabilities'),
  previewProxy: id => ipcRenderer.invoke('media:proxy', id),
  releaseProxy: id => ipcRenderer.invoke('media:release-proxy', id),
  importFiles: files => ipcRenderer.invoke('media:import', files?.map(file => webUtils.getPathForFile(file))),
  importFolder: () => ipcRenderer.invoke('media:import-folder'),
  importUrl: (url, options) => ipcRenderer.invoke('media:import-url', url, options),
  export: (id, settings, token) => ipcRenderer.invoke('media:export', id, settings, token),
  saveProject: project => ipcRenderer.invoke('project:save', project),
  merge: (clips, settings, transition) => ipcRenderer.invoke('media:merge', clips, settings, transition),
  detectSilence: (id, options) => ipcRenderer.invoke('media:silence', id, options),
  previewFrame: (id, edit, time) => ipcRenderer.invoke('media:frame-preview', id, edit, time),
  previewAudio: (id, edit) => ipcRenderer.invoke('media:audio-preview', id, edit),
  measureLoudness: (id, edit) => ipcRenderer.invoke('media:loudness', id, edit),
  detectScenes: (id, options) => ipcRenderer.invoke('media:scenes', id, options),
  contactSheet: (id, edit, options) => ipcRenderer.invoke('media:contact-sheet', id, edit, options),
  thumbnails: id => ipcRenderer.invoke('media:thumbnails', id),
  cancelWaveform: () => { void ipcRenderer.invoke('media:cancel-waveform').catch(() => {}); },
  onWaveformProgress: callback => {
    const listener = (_event: unknown, progress: Parameters<typeof callback>[0]) => callback(progress);
    ipcRenderer.on('media:waveform-progress', listener);
    return () => ipcRenderer.removeListener('media:waveform-progress', listener);
  },
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
