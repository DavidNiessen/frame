import { discardAutosave, readAutosave, readRetainedWorkspace, writeRetainedWorkspace, type RetainedMedia } from '../storage/autosave';
import { sameLayerSource } from '../core/audio-layers';
import type { MediaAsset, MediaEngine } from '../core/types';
import type { WorkspaceRecovery } from '../core/workspace-recovery';

export function browserWorkspace(engine: MediaEngine, files: Map<string, File>, sources: Map<string, MediaAsset>): Pick<MediaEngine, 'saveWorkspace' | 'recoverWorkspace' | 'discardWorkspace'> {
  const retainedIds = new Map<string, string>();
  return {
    async saveWorkspace(document, ids) {
      const media = new Map<string, RetainedMedia>();
      for (const id of ids) {
        const file = files.get(id); if (!file) throw new Error('The workspace is missing source media.');
        media.set(retainedIds.get(id) ?? id, { blob: file, name: file.name, type: file.type, lastModified: file.lastModified, relativePath: sources.get(id)?.relativePath });
      }
      await writeRetainedWorkspace(document, media);
    },
    async recoverWorkspace(progress) {
      const saved = await readRetainedWorkspace();
      if (!saved) {
        if (await readAutosave()) throw new Error('This older autosave did not retain its media. Import your files once; new workspaces reopen automatically.');
        return null;
      }
      const recovery: WorkspaceRecovery = { document: saved.document, assets: [], sourceIds: [], issues: [] };
      for (const [index, record] of saved.media.entries()) {
        const identity = saved.document.project.sources[index].source;
        try {
          if (!record || !(record.blob instanceof Blob) || record.name !== identity.name || record.blob.size !== identity.size) throw new Error('The saved source is unavailable.');
          progress({ ratio: index / saved.media.length, message: `Reopening ${index + 1} of ${saved.media.length} files…` });
          const report = await engine.importFiles([new File([record.blob], record.name, { type: record.type, lastModified: record.lastModified })]);
          const asset = report.assets[0];
          if (!asset) throw new Error(report.issues[0]?.message || 'The saved source could not be read.');
          if (!sameLayerSource(identity, asset)) { await engine.release(asset); throw new Error('The saved source has changed.'); }
          asset.relativePath = record.relativePath;
          retainedIds.set(asset.id, saved.mediaIds[index]);
          recovery.assets.push(asset); recovery.sourceIds.push(asset.id);
        } catch (error) { recovery.sourceIds.push(null); recovery.issues.push(`${identity.name}: ${(error as Error).message}`); }
      }
      return recovery;
    },
    async discardWorkspace() { await discardAutosave(); retainedIds.clear(); },
  };
}
