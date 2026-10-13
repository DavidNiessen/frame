import { app, type IpcMainInvokeEvent } from 'electron';
import { join } from 'node:path';
import { stat } from 'node:fs/promises';
import { MAX_IMPORT_FILES } from '../src/core/imports';
import { sameLayerSource } from '../src/core/audio-layers';
import type { AutosaveDocument } from '../src/core/autosave';
import type { ImportReport } from '../src/core/types';
import type { WorkspaceRecovery } from '../src/core/workspace-recovery';
import type { SessionAssets } from './media-session';
import type { WindowIpc } from './window-ipc';
import type { MediaJobs } from './jobs';
import { WorkspaceStore } from './workspace-store';

// Reopened main windows share the same write queue, so older writes cannot race a clear.
const stores = new Map<string, WorkspaceStore>();
export function registerWorkspace(
  assets: SessionAssets,
  jobs: MediaJobs,
  trusted: (event: IpcMainInvokeEvent) => void,
  ipc: WindowIpc,
  imports: {
    temporary: (id: string) => boolean;
    read: (
      event: IpcMainInvokeEvent,
      inputs: { path: string; relativePath?: string }[],
    ) => Promise<ImportReport>;
  },
) {
  const root = join(app.getPath('userData'), 'workspace');
  const store = stores.get(root) ?? new WorkspaceStore(root);
  stores.set(root, store);
  ipc.handle('workspace:save', async (event, document: AutosaveDocument, ids: string[]) => {
    trusted(event);
    if (!Array.isArray(ids) || ids.length > MAX_IMPORT_FILES)
      throw new Error('Invalid workspace sources.');
    const inputs = ids.map((id) => {
      const item = assets.get(id);
      if (!item) throw new Error('The workspace source is unavailable.');
      return { ...item, path: item.originalPath ?? item.path, temporary: imports.temporary(id) };
    });
    await store.save(document, inputs);
  });
  ipc.handle('workspace:clear', async (event) => {
    trusted(event);
    await store.clear();
  });
  ipc.handle('workspace:recover', async (event) => {
    trusted(event);
    const saved = await store.read();
    if (!saved) return null;
    return jobs.run(async () => {
      const recovery: WorkspaceRecovery = {
        document: saved.document,
        assets: [],
        sourceIds: [],
        issues: [],
      };
      for (const [index, source] of saved.sources.entries()) {
        const identity = saved.document.project.sources[index].source;
        try {
          const info = await stat(source.path);
          if (
            !info.isFile() ||
            info.size !== identity.size ||
            Math.abs(info.mtimeMs - source.mtimeMs) > 1
          )
            throw new Error('The source has changed.');
          const report = await imports.read(event, [source]);
          const asset = report.assets[0];
          if (!asset) throw new Error(report.issues[0]?.message || 'Unable to reopen this file.');
          if (!sameLayerSource(identity, asset)) {
            assets.delete(asset.id);
            throw new Error('The source has changed.');
          }
          recovery.assets.push(asset);
          recovery.sourceIds.push(asset.id);
        } catch (error) {
          recovery.sourceIds.push(null);
          const message =
            (error as NodeJS.ErrnoException).code === 'ENOENT'
              ? 'The original file was moved or deleted.'
              : (error as Error).message;
          recovery.issues.push(`${identity.name}: ${message}`);
        }
      }
      return recovery;
    });
  });
}
