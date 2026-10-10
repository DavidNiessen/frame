import { audioLayerSource } from '../core/audio-layers';
import { notifyCompletion } from '../core/completion-notifications';
import { sampleRates } from '../core/audio-output';
import type { UrlImportOptions } from '../core/youtube';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createEngine } from '../engines';
import { defaultSettings, type EditSettings, type ExportProgress, type ExportResult, type ImportReport, type MediaAsset, type MediaEngine } from '../core/types';
import { parseEdit } from '../core/project';
import { clipEffectKeys, editClips, clipRecipe, patchClip } from '../core/clips';
import { resizeSection } from '../core/timeline-edit';
import { editedDuration } from '../core/timeline';
import { validateEdit } from '../core/export-plan';
interface History { past: EditSettings[]; present: EditSettings; future: EditSettings[] }
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))
  .replace(/^Error invoking remote method '[^']+': (Error: )?/, '').slice(0, 600);
export function useEditor() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [histories, setHistories] = useState<Record<string, History>>({});
  const [busy, setBusy] = useState<'import' | 'export' | 'batch' | 'analysis' | 'merge' | null>(null);
  const [notice, setNotice] = useState('');
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const engineRef = useRef<Promise<MediaEngine> | null>(null);
  const assetsRef = useRef(assets); assetsRef.current = assets;
  const resultRef = useRef(result); resultRef.current = result;
  const busyRef = useRef(false);
  const engine = () => engineRef.current ??= createEngine();
  const asset = assets.find(a => a.id === selected) ?? null;
  const history = selected ? histories[selected] : undefined;
  const edit = history?.present ?? null;
  useEffect(() => () => {
    if (resultRef.current?.url) URL.revokeObjectURL(resultRef.current.url);
    if (engineRef.current) void engineRef.current.then(e => { e.cancelWaveform?.(); e.cancel(); return Promise.all(assetsRef.current.map(a => e.release(a))); });
  }, []);
  async function performImport(files?: File[], mode: 'files' | 'sample' | 'folder' | 'launch' | 'url' = 'files', launch?: { id: string; activate: () => void; select: (ids: string[]) => void }, url?: string, urlOptions?: UrlImportOptions) {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy('import'); setNotice(''); setProgress({ ratio: 0, message: 'Reading your media…' });
    try {
      launch?.activate();
      const e = await engine();
      const report = mode === 'url' && url ? await e.importUrl(url, setProgress, urlOptions) : mode === 'launch' && launch && e.importLaunch ? await e.importLaunch(launch.id, setProgress) : mode === 'sample' ? await e.importSample() : mode === 'folder' && e.importFolder ? await e.importFolder(setProgress) : await e.importFiles(files, setProgress);
      setImportReport(report);
      const imported = report.assets;
      if (mode === 'url' && !imported.length) throw new Error('The downloaded file could not be read as video or audio. Try another direct file link.');
      launch?.select(imported.map(asset => asset.id));
      if (!imported.length) { if (report.issues.length) setNotice(`${report.issues[0].name}: ${report.issues[0].message}`); else if (report.skipped || report.folderName) setNotice('No supported video or audio files found in this folder.'); return true; }
      setAssets(current => [...current, ...imported.filter(item => !current.some(asset => asset.id === item.id))]);
      setHistories(current => {
        const next = { ...current };
        for (const item of imported) if (!next[item.id]) next[item.id] = { past: [], present: defaultSettings(item), future: [] };
        return next;
      });
      setSelected(imported[0].id); setSelectedClip(null);
      setNotice(`Imported ${imported.length} ${imported.length === 1 ? 'file' : 'files'}.${report.issues.length ? ` ${report.issues.length} could not be read.` : ''}${report.skipped ? ` Skipped ${report.skipped} non-media ${report.skipped === 1 ? 'file' : 'files'}.` : ''}`);
    } catch (error) { if (mode === 'url') throw new Error(messageOf(error)); setNotice(messageOf(error)); }
    finally { busyRef.current = false; setBusy(null); setProgress(null); }
    return true;
  }
  const update = useCallback((patch: Partial<EditSettings>) => {
    if (!selected || busyRef.current) return;
    setHistories(current => {
      const h = current[selected]; if (!h) return current;
      const next = { ...h.present, ...patch };
      if (patch.format && next.audioSampleRate !== null && !sampleRates(next.format).includes(next.audioSampleRate)) next.audioSampleRate = null;
      if (next.clips) {
        if (patch.start !== undefined || patch.end !== undefined) next.clips = next.clips.map(clip => ({ ...clip, start: Math.max(clip.start, next.start), end: Math.min(clip.end, next.end) })).filter(clip => clip.end - clip.start >= .05);
        if (!next.clips.length) return current;
        next.clips = next.clips.map(clip => { const effects = { ...clip.effects }, duration = (clip.end - clip.start) / (effects.speed ?? next.speed); for (const key of ['audioFadeIn', 'audioFadeOut', 'videoFadeIn', 'videoFadeOut'] as const) if (effects[key] !== undefined) effects[key] = Math.min(effects[key], duration); return { ...clip, effects }; });
        next.start = Math.min(...next.clips.map(clip => clip.start)); next.end = Math.max(...next.clips.map(clip => clip.end)); next.cuts = []; next.splits = [];
      }
      const duration = editedDuration(next);
      for (const key of ['audioFadeIn', 'audioFadeOut', 'videoFadeIn', 'videoFadeOut'] as const) next[key] = Math.min(next[key], duration);
      if (JSON.stringify(next) === JSON.stringify(h.present)) return current;
      return { ...current, [selected]: { past: [...h.past, h.present].slice(-100), present: next, future: [] } };
    });
  }, [selected]);
  function travel(direction: 'undo' | 'redo') {
    if (!selected || busyRef.current) return;
    setHistories(current => {
      const h = current[selected]; if (!h) return current;
      if (direction === 'undo') {
        if (!h.past.length) return current;
        return { ...current, [selected]: { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] } };
      }
      if (!h.future.length) return current;
      return { ...current, [selected]: { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } };
    });
  }
  async function remove(item: MediaAsset) {
    if (busyRef.current) return;
    if (assets.some(source => source.id !== item.id && histories[source.id]?.present.audioLayers?.some(layer => audioLayerSource(layer, assets)?.id === item.id))) { setNotice('Remove this source’s music or voiceover tracks before removing it from the library.'); return; }
    await (await engine()).release(item);
    setAssets(current => current.filter(a => a.id !== item.id));
    setHistories(current => { const next = { ...current }; delete next[item.id]; return next; });
    if (selected === item.id) setSelected(assets.find(a => a.id !== item.id)?.id ?? null);
  }
  async function exportMedia() {
    if (!asset || !edit || busyRef.current) return;
    try { validateEdit(asset, edit); } catch (error) { setNotice(messageOf(error)); return; }
    busyRef.current = true; setBusy('export'); setNotice('');
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null); setProgress({ ratio: 0, message: 'Preparing your export…' });
    try {
      const output = await (await engine()).export(asset, edit, setProgress);
      if (output) await notifyCompletion({ kind: 'export', total: 1, completed: 1, failed: 0 });
      setResult(output); setNotice(output ? 'Export complete. Your original file is unchanged.' : 'Export cancelled.');
    } catch (error) { setNotice(messageOf(error)); }
    finally { busyRef.current = false; setBusy(null); setProgress(null); }
  }
  function restoreEdits(entries: { id: string; edit: EditSettings }[], selectedId: string) {
    if (busyRef.current) throw new Error('Wait for processing to finish.');
    const validated = entries.map(entry => {
      const source = assets.find(a => a.id === entry.id);
      if (!source) throw new Error('Import all source media before restoring edits.');
      return { id: entry.id, edit: parseEdit(entry.edit, source) };
    });
    setHistories(current => {
      const next = { ...current };
      for (const { id, edit } of validated) {
        const h = current[id]; next[id] = { past: [...h.past, h.present].slice(-100), present: edit, future: [] };
      }
      return next;
    });
    setSelected(selectedId); setSelectedClip(null);
  }
  async function runExclusive<T>(kind: 'batch' | 'analysis' | 'merge', task: (engine: MediaEngine) => Promise<T>): Promise<T> {
    if (busyRef.current) throw new Error('Wait for processing to finish.');
    busyRef.current = true; setBusy(kind);
    try { return await task(await engine()); }
    finally { busyRef.current = false; setBusy(null); }
  }
  function dismissResult() { if (result?.url) URL.revokeObjectURL(result.url); setResult(null); }
  const clip = edit ? editClips(edit).find(clip => clip.id === selectedClip) : undefined;
  const scopedEdit = useMemo(() => edit && clip ? clipRecipe(edit, clip) : edit, [edit, selectedClip]);
  return { selectedClip: clip?.id ?? null, selectClip: setSelectedClip, scopedEdit,
    updateClip: (patch: Partial<EditSettings>) => {
      if (edit && clip) {
        const effects = Object.fromEntries(Object.entries(patch).filter(([key]) => clipEffectKeys.includes(key as typeof clipEffectKeys[number])));
        const next = patchClip(edit, clip.id, effects);
        if (patch.start !== undefined || patch.end !== undefined) Object.assign(next, resizeSection({ ...edit, ...next }, editClips(edit).findIndex(item => item.id === clip.id), { start: patch.start ?? clip.start, end: patch.end ?? clip.end }, asset!.duration));
        update(next);
      } else {
        const keys = Object.keys(patch);
        update({ ...patch, ...(edit?.clips ? { clips: edit.clips.map(item => ({ ...item, effects: Object.fromEntries(Object.entries(item.effects).filter(([key]) => !keys.includes(key))) })) } : {}) });
      }
    },
    assets, asset, edit, selected, busy, notice, setNotice, progress, result, dismissResult, importReport,
    platform: window.frameDesktop ? 'desktop' as const : 'web' as const,
    select: (id: string) => { if (!busyRef.current) { setSelected(id); setSelectedClip(null); } },
    importMedia: (files?: File[], sample = false) => performImport(files, sample ? 'sample' : 'files'),
    importUrl: (url: string, options?: UrlImportOptions) => performImport(undefined, 'url', undefined, url, options),
    importFolder: (files?: File[]) => performImport(files, 'folder'), update, remove, exportMedia, restoreEdits, runExclusive,
    importLaunch: (id: string, activate: () => void, select: (ids: string[]) => void) => performImport(undefined, 'launch', { id, activate, select }),
    backgroundEngine: engine,
    settingsFor: (id: string) => histories[id]?.present ?? defaultSettings(assets.find(a => a.id === id)!),
    cancel: () => void engine().then(e => e.cancel()),
    undo: () => travel('undo'), redo: () => travel('redo'),
    canUndo: !!history?.past.length, canRedo: !!history?.future.length,
    reset: () => { if (asset) update(defaultSettings(asset)); },
  };
}
export type Editor = ReturnType<typeof useEditor>;
