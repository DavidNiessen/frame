import type { AutosaveDocument } from './autosave';
import { sameLayerSource } from './audio-layers';
import { parseEdit, sourceIdentity } from './project';
import type { EditSettings, MediaAsset } from './types';

export interface WorkspaceRecovery {
  document: AutosaveDocument;
  assets: MediaAsset[];
  /** Exact source indices survive duplicate filenames and partial recovery. */
  sourceIds: (string | null)[];
  issues: string[];
}
export function recoveredEdits(recovery: WorkspaceRecovery) {
  const { document, assets, sourceIds } = recovery,
    issues = [...recovery.issues];
  const entries: { id: string; edit: EditSettings }[] = [];
  document.project.sources.forEach((entry, index) => {
    const asset = assets.find((item) => item.id === sourceIds[index]);
    if (!asset || !sameLayerSource(entry.source, asset)) {
      if (asset) issues.push(`${entry.source.name}: the source has changed.`);
      return;
    }
    const restoreLayers = (layers: EditSettings['audioLayers']) =>
      layers?.flatMap((layer) => {
        const sourceIndex =
          layer.sourceIndex ??
          document.project.sources.findIndex((item) => sameLayerSource(layer.source, item.source));
        const source = assets.find((item) => item.id === sourceIds[sourceIndex]);
        if (!source || !sameLayerSource(layer.source, source)) {
          issues.push(`${asset.name}: unavailable track “${layer.source.name}” was omitted.`);
          return [];
        }
        const { sourceIndex: _index, sourceId: _id, ...portable } = layer;
        return [{ ...portable, sourceId: source.id, source: sourceIdentity(source) }];
      });
    entries.push({
      id: asset.id,
      edit: parseEdit(
        {
          ...entry.edit,
          audioLayers: restoreLayers(entry.edit.audioLayers),
          mediaLayers: entry.edit.mediaLayers?.flatMap((layer) => {
            const index =
                layer.sourceIndex ??
                document.project.sources.findIndex((item) =>
                  sameLayerSource(layer.source, item.source),
                ),
              source = assets.find((item) => item.id === sourceIds[index]);
            if (!source || !sameLayerSource(layer.source, source)) {
              issues.push(
                `${asset.name}: unavailable visual track “${layer.source.name}” was omitted.`,
              );
              return [];
            }
            const { sourceIndex: _index, sourceId: _id, ...portable } = layer;
            return [{ ...portable, sourceId: source.id, source: sourceIdentity(source) }];
          }),
          effectInstances: entry.edit.effectInstances?.map((instance) =>
            instance.effect === 'mix'
              ? {
                  ...instance,
                  settings: {
                    ...instance.settings,
                    audioLayers: restoreLayers(instance.settings.audioLayers),
                  },
                }
              : instance,
          ),
        },
        asset,
      ),
    });
  });
  const selected = sourceIds[document.project.selectedSource];
  return {
    entries,
    issues,
    selected: entries.some((entry) => entry.id === selected) ? selected! : (entries[0]?.id ?? null),
  };
}
