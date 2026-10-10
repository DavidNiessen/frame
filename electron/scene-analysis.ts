import type { IpcMainInvokeEvent } from 'electron';
import { parseSceneOptions, sceneArgs, SceneCollector } from '../src/core/scenes';
import { runFfmpeg } from './native';
import type { MediaJobs } from './jobs';
import type { SessionAssets } from './media-session';
import type { WindowIpc } from './window-ipc';
export function registerSceneAnalysis(assets: SessionAssets, jobs: MediaJobs, trusted: (event: IpcMainInvokeEvent) => void, ipc: WindowIpc) {
  ipc.handle('media:scenes', (event, id: string, value: unknown) => {
    trusted(event); const item = assets.get(id); if (!item) throw new Error('Import the source again.'); const options = parseSceneOptions(value);
    return jobs.run(async execute => {
      const collector = new SceneCollector(options.minGap);
      await execute(runFfmpeg(sceneArgs(item.asset, item.path, options), item.asset.duration, ratio => { if (!event.sender.isDestroyed()) event.sender.send('media:progress', { ratio, message: 'Finding scene changes…' }); }, line => collector.push(line)));
      return collector.finish(item.asset.duration);
    });
  });
}
