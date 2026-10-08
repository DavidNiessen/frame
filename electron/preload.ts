import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { DesktopBridge } from '../src/engines/bridge';
const bridge: DesktopBridge = {
  importFiles: files => ipcRenderer.invoke('media:import', files?.map(file => webUtils.getPathForFile(file))),
  importSample: () => ipcRenderer.invoke('media:sample'),
  export: (id, settings) => ipcRenderer.invoke('media:export', id, settings),
  saveProject: project => ipcRenderer.invoke('project:save', project),
  cancel: () => ipcRenderer.send('media:cancel'),
  release: id => ipcRenderer.invoke('media:release', id),
  onProgress: callback => {
    const listener = (_event: unknown, progress: Parameters<typeof callback>[0]) => callback(progress);
    ipcRenderer.on('media:progress', listener);
    return () => ipcRenderer.removeListener('media:progress', listener);
  },
};
contextBridge.exposeInMainWorld('frameDesktop', bridge);
