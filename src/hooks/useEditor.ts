import { useEffect, useRef, useState } from 'react';
import { createEngine } from '../engines';
import { defaultSettings, type EditSettings, type ExportProgress, type ExportResult, type MediaAsset, type MediaEngine } from '../core/types';
import { parseEdit } from '../core/project';
import { validateEdit } from '../core/export-plan';
interface History { past: EditSettings[]; present: EditSettings; future: EditSettings[] }
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))
  .replace(/^Error invoking remote method '[^']+': (Error: )?/, '').slice(0, 600);
export function useEditor() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [histories, setHistories] = useState<Record<string, History>>({});
  const [busy, setBusy] = useState<'import' | 'export' | 'batch' | null>(null);
  const [notice, setNotice] = useState('');
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
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
    if (engineRef.current) void engineRef.current.then(e => { e.cancel(); return Promise.all(assetsRef.current.map(a => e.release(a))); });
  }, []);
  async function importMedia(files?: File[], sample = false) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy('import'); setNotice('');
    try {
      const e = await engine();
      const imported = sample ? await e.importSample() : await e.importFiles(files);
      if (!imported.length) return;
      setAssets(current => [...current, ...imported]);
      setHistories(current => {
        const next = { ...current };
        for (const item of imported) next[item.id] = { past: [], present: defaultSettings(item), future: [] };
        return next;
      });
      setSelected(imported[0].id);
      setNotice(`Imported ${imported.length} ${imported.length === 1 ? 'file' : 'files'}.`);
    } catch (error) { setNotice(messageOf(error)); }
    finally { busyRef.current = false; setBusy(null); }
  }
  function update(patch: Partial<EditSettings>) {
    if (!selected || busyRef.current) return;
    setHistories(current => {
      const h = current[selected]; if (!h) return current;
      const next = { ...h.present, ...patch };
      if (JSON.stringify(next) === JSON.stringify(h.present)) return current;
      return { ...current, [selected]: { past: [...h.past, h.present].slice(-100), present: next, future: [] } };
    });
  }
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
    setSelected(selectedId);
  }
  async function runExclusive<T>(kind: 'batch', task: (engine: MediaEngine) => Promise<T>): Promise<T> {
    if (busyRef.current) throw new Error('Wait for processing to finish.');
    busyRef.current = true; setBusy(kind);
    try { return await task(await engine()); }
    finally { busyRef.current = false; setBusy(null); }
  }
  function dismissResult() { if (result?.url) URL.revokeObjectURL(result.url); setResult(null); }
  return { assets, asset, edit, selected, busy, notice, setNotice, progress, result, dismissResult,
    platform: window.frameDesktop ? 'desktop' as const : 'web' as const,
    select: (id: string) => { if (!busyRef.current) setSelected(id); },
    importMedia, update, remove, exportMedia, restoreEdits, runExclusive,
    settingsFor: (id: string) => histories[id]?.present ?? defaultSettings(assets.find(a => a.id === id)!),
    cancel: () => void engine().then(e => e.cancel()),
    undo: () => travel('undo'), redo: () => travel('redo'),
    canUndo: !!history?.past.length, canRedo: !!history?.future.length,
    reset: () => { if (asset) update(defaultSettings(asset)); },
  };
}
export type Editor = ReturnType<typeof useEditor>;
