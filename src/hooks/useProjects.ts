import { loadingActivity } from '../core/loading-activity';
import { useLoadingActivity } from './useLoadingActivity';
import type { EditSettings } from '../core/types';
import { serializeProject, MAX_PROJECT_BYTES } from '../core/project-storage';
import { sameLayerSource } from '../core/audio-layers';
import { sourceIdentity } from '../core/project';
import { useState } from 'react';
import { createProject, matchSources, parseProject, projectFilename, type ProjectDocument } from '../core/project';
import type { Editor } from './useEditor';
export function useProjects(editor: Editor) {
  const [name, setName] = useState('');
  const [pending, setPending] = useState<ProjectDocument | null>(null);
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const report = (value: unknown) => {
    const message = (value instanceof Error ? value.message : 'Could not read the project.').replace(/^Error invoking remote method '[^']+': (Error: )?/, '').slice(0, 600);
    setError(message); editor.setNotice(message);
  };
  const matched = pending ? matchSources(pending, editor.assets) : [];
  const links = matched.map((id, index) => overrides[index] ?? id);
  useLoadingActivity(saving, 'Saving project…');
  async function open(file: File) {
    if (editor.busy || saving) return;
    try {
      if (file.size > MAX_PROJECT_BYTES) throw new Error('Project files must be smaller than 16 MB.');
      const project = parseProject(JSON.parse(await loadingActivity.run('Loading project…', () => file.text())));
      setError(''); setOverrides({}); setPending(project);
    } catch (error) { report(error); }
  }
  async function save() {
    if (!editor.asset || editor.busy || saving) return;
    setError(''); setSaving(true);
    try {
      const title = name || editor.asset.name.replace(/\.[^.]+$/, '').slice(0, 120);
      const project = createProject(title, editor.assets, editor.settingsFor, editor.asset.id);
      const serialized = serializeProject(project);
      if (window.frameDesktop) {
        if (!await window.frameDesktop.saveProject(project)) return;
      } else {
        const url = URL.createObjectURL(new Blob([serialized], { type: 'application/json' }));
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = projectFilename(title);
        anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
      setName(title); editor.setNotice('Project saved. Keep your source media to reopen it later.');
    } catch (error) { report(error); } finally { setSaving(false); }
  }
  const canRestore = !!pending && links.every(Boolean) && new Set(links).size === links.length;
  function restore() {
    if (!pending || !canRestore || editor.busy) return;
    try {
      const restoreLayers = (layers: EditSettings['audioLayers']) => layers?.map(layer => {
        const sourceIndex = layer.sourceIndex ?? pending.sources.findIndex(item => sameLayerSource(layer.source, item.source));
        const asset = editor.assets.find(item => item.id === links[sourceIndex])!;
        const { sourceIndex: _sourceIndex, ...runtime } = layer;
        return { ...runtime, sourceId: asset.id, source: sourceIdentity(asset) };
      });
      editor.restoreEdits(pending.sources.map((entry, index) => ({ id: links[index]!, edit: { ...entry.edit, audioLayers: restoreLayers(entry.edit.audioLayers), effectInstances: entry.edit.effectInstances?.map(instance => instance.effect === 'mix' ? { ...instance, settings: { ...instance.settings, audioLayers: restoreLayers(instance.settings.audioLayers) } } : instance) } })), links[pending.selectedSource]!);
      setName(pending.name); setPending(null); editor.setNotice('Project opened. Your saved edits are ready.');
    } catch (error) { report(error); }
  }
  return { recovered: setName, reset: () => { setName(''); setPending(null); setOverrides({}); setError(''); }, name, pending, links, saving, canRestore, error, open, save, restore,
    close: () => setPending(null), link: (index: number, id: string) => setOverrides(current => ({ ...current, [index]: id })) };
}
export type Projects = ReturnType<typeof useProjects>;
