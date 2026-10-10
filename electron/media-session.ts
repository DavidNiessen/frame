import { registerWorkspace } from './workspace';
import type { BrowserWindow } from 'electron';
import type { MediaAsset } from '../src/core/types';
import { MediaJobs } from './jobs';
import { registerAcceleration } from './acceleration';
import { createProxies } from './proxies';
import { createBatchFolders } from './batch';
import { registerImports } from './imports';
import { registerLoudnessAnalysis } from './loudness-analysis';
import { registerSceneAnalysis } from './scene-analysis';
import { registerAnalysis } from './analysis';
import { registerMerge } from './merge';
import { registerProjectSaving } from './projects';
import { registerExports } from './exports';
import type { LaunchInbox } from './launch-inbox';
import { trustWindow, type WindowIpc } from './window-ipc';

export type SessionAssets = Map<string, { path: string; asset: MediaAsset }>;
export function createMediaSession(window: BrowserWindow, launches: LaunchInbox, ipc: WindowIpc, workspaceEnabled = true) {
  const assets: SessionAssets = new Map(), jobs = new MediaJobs(), trusted = trustWindow(window);
  registerAcceleration(jobs, trusted, ipc);
  const proxies = createProxies(assets, jobs, trusted, ipc);
  const folders = createBatchFolders(() => window, trusted, ipc);
  const downloads = registerImports(assets, jobs, () => window, trusted, launches, ipc);
  if (workspaceEnabled) registerWorkspace(assets, jobs, trusted, ipc, downloads);
  registerLoudnessAnalysis(assets, jobs, trusted, ipc);
  registerSceneAnalysis(assets, jobs, trusted, ipc);
  const analysis = registerAnalysis(assets, jobs, trusted, ipc);
  registerMerge(assets, jobs, () => window, trusted, ipc);
  registerProjectSaving(() => window, trusted, () => Array.from(assets.values(), item => item.path), ipc);
  registerExports(window, assets, jobs, folders, ipc);
  ipc.handle('media:release', async (_event, id: string) => {
    if (!jobs.busy) { await proxies.releaseAsset(id); await downloads.release(id); assets.delete(id); }
  });
  const clear = () => { analysis.cancel(); jobs.cancel(); proxies.clear(); downloads.clear(); assets.clear(); };
  window.once('closed', clear);
  return { jobs, clear, path: (host: string, id: string) => host === 'asset' ? assets.get(id)?.path : host === 'proxy' ? proxies.path(id) : undefined };
}
export type MediaSession = ReturnType<typeof createMediaSession>;
