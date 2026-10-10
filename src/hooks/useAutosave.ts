import { useEffect, useMemo, useRef, useState } from 'react';
import { createProject } from '../core/project';
import { MAX_AUTOSAVE_BYTES, type AutosaveDocument } from '../core/autosave';
import { discardAutosave, readAutosave, writeAutosave } from '../storage/autosave';
import type { Editor } from './useEditor';
export function useAutosave(editor: Editor, name: string, restoreGeneration: number, enabled = true) {
  const [loading, setLoading] = useState(true), [recovery, setRecovery] = useState<AutosaveDocument | null>(null), [savedAt, setSavedAt] = useState<number | null>(null), [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const requested = useRef(false), generation = useRef(restoreGeneration), mounted = useRef(true);
  useEffect(() => { mounted.current = true; void readAutosave().then(value => { if (mounted.current) setRecovery(value); }).catch(e => { if (mounted.current) setError(e.message); }).finally(() => { if (mounted.current) setLoading(false); }); return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (requested.current && restoreGeneration > generation.current) { requested.current = false; setRecovery(null); setError(''); } generation.current = restoreGeneration; }, [restoreGeneration]);
  const snapshot = useMemo(() => {
    if (!enabled || !editor.asset || !editor.assets.length) return null;
    try { const project = createProject(name || 'Recovered workspace', editor.assets, editor.settingsFor, editor.asset.id); const serialized = JSON.stringify(project); if (serialized.length > MAX_AUTOSAVE_BYTES - 1000) throw new Error('This workspace exceeds the 16 MB autosave limit. Save a project manually.'); return { project, serialized, error: '' }; }
    catch (e) { return { project: null, serialized: '', error: e instanceof Error ? e.message : String(e) }; }
  }, [editor.assets, editor.edit, editor.selected, name, enabled]);
  const hadWorkspace = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    if (snapshot?.project) hadWorkspace.current = true;
    if (!loading && !recovery && !snapshot && hadWorkspace.current) { hadWorkspace.current = false; void discardAutosave().then(() => { if (mounted.current) { setSavedAt(null); setSaving(false); } }).catch(e => { if (mounted.current) setError(e.message); }); }
  }, [!!snapshot, loading, recovery, enabled]);
  const snapshotRef = useRef(snapshot); snapshotRef.current = snapshot;
  useEffect(() => {
    if (!enabled || loading || recovery || !snapshot) { setSaving(false); return; }
    if (snapshot.error) { setError(`Autosave paused: ${snapshot.error}`); return; }
    setSaving(true); let active = true;
    const persist = () => {
      if (!snapshotRef.current?.project) return; const value: AutosaveDocument = { version: 1, savedAt: Date.now(), project: snapshotRef.current.project };
      void writeAutosave(value).then(() => { if (mounted.current && active) { setSavedAt(value.savedAt); setSaving(false); setError(''); } }).catch(e => { if (mounted.current && active) { setSaving(false); setError(e.message); } });
    };
    const timer = window.setTimeout(persist, 700); const hidden = () => { if (document.visibilityState === 'hidden') persist(); };
    window.addEventListener('pagehide', persist); document.addEventListener('visibilitychange', hidden);
    return () => { active = false; clearTimeout(timer); window.removeEventListener('pagehide', persist); document.removeEventListener('visibilitychange', hidden); };
  }, [snapshot?.serialized, snapshot?.error, loading, recovery, enabled]);
  async function discard() { try { await discardAutosave(); requested.current = false; setRecovery(null); setSavedAt(null); setError(''); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }
  return { recovery, loading, saving, savedAt, error, discard, prepareRecovery: () => { requested.current = true; } };
}
