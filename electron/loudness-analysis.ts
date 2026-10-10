import type { IpcMainInvokeEvent } from 'electron';
import { loudnessArgs, LoudnessCollector } from '../src/core/loudness';
import { parseEdit } from '../src/core/project';
import { runFfmpeg } from './native';
import { editedDuration } from '../src/core/timeline';
import type { MediaJobs } from './jobs';
import type { SessionAssets } from './media-session';
import type { WindowIpc } from './window-ipc';
export function registerLoudnessAnalysis(assets: SessionAssets, jobs: MediaJobs, trusted: (event: IpcMainInvokeEvent) => void, ipc: WindowIpc) {
  ipc.handle('media:loudness', (event, id: string, value: unknown) => {
    trusted(event); const source = assets.get(id); if (!source) throw new Error('Import the source again.'); const edit = parseEdit(value, source.asset);
    return jobs.run(async execute => {
      const collector = new LoudnessCollector();
      await execute(runFfmpeg(loudnessArgs(source.asset, edit, source.path), editedDuration(edit), ratio => { if (!event.sender.isDestroyed()) event.sender.send('media:progress', { ratio, message: 'Measuring edited audio…' }); }, line => collector.push(line)));
      return collector.finish();
    });
  });
}
