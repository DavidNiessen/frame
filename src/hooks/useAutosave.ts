import { useEffect, useMemo, useRef, useState } from 'react';
import { createProject } from '../core/project';
import { parseAutosave, type AutosaveDocument } from '../core/autosave';
import { discardAutosave, readAutosave } from '../storage/autosave';
import type { Editor } from './useEditor';
const messageOf = (error: unknown) =>
  (error instanceof Error ? error.message : String(error))
    .replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    .slice(0, 600);

export function useAutosave(
  editor: Editor,
  name: string,
  onRecovered: (name: string) => void,
  enabled = true,
) {
  const [loading, setLoading] = useState(true),
    [savedAt, setSavedAt] = useState<number | null>(null),
    [error, setError] = useState('');
  const [saving, setSaving] = useState(false),
    [clearing, setClearing] = useState(false);
  const mounted = useRef(false),
    boot = useRef<ReturnType<Editor['recoverWorkspace']> | null>(null);
  const pending = useRef<Promise<unknown>>(Promise.resolve()),
    epoch = useRef(0),
    clearingRef = useRef(false),
    hadWorkspace = useRef(false);
  const restoredSnapshot = useRef<string | null>(null),
    latest = useRef({ editor, onRecovered });
  latest.current = { editor, onRecovered };
  useEffect(() => {
    mounted.current = true;
    const editor = latest.current.editor;
    boot.current ??= editor.recoverWorkspace().then(async (value) => {
      // Older desktop versions kept only recipes in IndexedDB, without file locations.
      if (!value && editor.platform === 'desktop' && (await readAutosave()))
        throw new Error(
          'This older autosave did not retain its media. Import your files once; new workspaces reopen automatically.',
        );
      return value;
    });
    let active = true;
    void boot.current
      .then((value) => {
        if (!active) return;
        if (value) {
          latest.current.onRecovered(value.document.project.name);
          setSavedAt(value.document.savedAt);
          restoredSnapshot.current = value.baseline ? JSON.stringify(value.baseline) : null;
        }
      })
      .catch((e) => {
        if (active) {
          setError(messageOf(e));
          latest.current.editor.setNotice(messageOf(e));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, []);
  const { asset, assets, edit, selected } = editor;
  const snapshot = useMemo(
    () => (enabled && asset && assets.length ? { assets, edit, selected, name } : null),
    [asset, assets, edit, selected, name, enabled],
  );
  const hasSnapshot = !!snapshot;
  const snapshotRef = useRef<{ editor: Editor; name: string } | null>(null);
  snapshotRef.current = snapshot ? { editor, name } : null;
  function enqueue(task: () => Promise<void>) {
    const next = pending.current.catch(() => {}).then(task);
    pending.current = next;
    return next;
  }
  useEffect(() => {
    if (loading || clearing || !enabled) return;
    if (hasSnapshot) hadWorkspace.current = true;
    else if (hadWorkspace.current) {
      hadWorkspace.current = false;
      void enqueue(async () => {
        await (await latest.current.editor.backgroundEngine()).discardWorkspace?.();
        await discardAutosave();
      })
        .then(() => {
          if (mounted.current) setSavedAt(null);
        })
        .catch((e) => {
          if (mounted.current) setError(messageOf(e));
        });
    }
  }, [hasSnapshot, loading, clearing, enabled]);
  useEffect(() => {
    if (loading || clearing || !snapshot) {
      setSaving(false);
      return;
    }
    setSaving(true);
    let active = true;
    const revision = epoch.current;
    const persist = () => {
      const current = snapshotRef.current;
      if (revision !== epoch.current || clearingRef.current || !current?.editor.asset) return;
      try {
        const project = createProject(
          current.name || 'Recovered workspace',
          current.editor.assets,
          current.editor.settingsFor,
          current.editor.asset.id,
        );
        // Opening a partial workspace must not erase unavailable sources until the user edits it.
        if (restoredSnapshot.current === JSON.stringify(project)) {
          setSaving(false);
          return;
        }
        restoredSnapshot.current = null;
        const document: AutosaveDocument = parseAutosave({
          version: 1,
          savedAt: Date.now(),
          project,
        });
        const ids = current.editor.assets.map((asset) => asset.id);
        setSaving(true);
        void enqueue(async () => {
          if (revision !== epoch.current) return;
          const e = await current.editor.backgroundEngine();
          if (!e.saveWorkspace) throw new Error('Workspace storage is unavailable.');
          await e.saveWorkspace(document, ids);
        })
          .then(() => {
            if (mounted.current && active && revision === epoch.current) {
              setSavedAt(document.savedAt);
              setSaving(false);
              setError('');
            }
          })
          .catch((e) => {
            if (mounted.current && active) {
              setSaving(false);
              setError(messageOf(e));
            }
          });
      } catch (e) {
        if (mounted.current && active) {
          setSaving(false);
          setError(messageOf(e));
        }
      }
    };
    const timer = window.setTimeout(persist, 700),
      hidden = () => {
        if (document.visibilityState === 'hidden') persist();
      };
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener('pagehide', persist);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [snapshot, loading, clearing]);
  async function clear() {
    if (loading || clearingRef.current || latest.current.editor.busy) return false;
    clearingRef.current = true;
    setClearing(true);
    epoch.current++;
    snapshotRef.current = null;
    restoredSnapshot.current = null;
    try {
      await latest.current.editor.clearLibrary(() => pending.current.catch(() => {}));
      await enqueue(async () => {
        await (await latest.current.editor.backgroundEngine()).discardWorkspace?.();
        await discardAutosave();
      });
      hadWorkspace.current = false;
      setSavedAt(null);
      setSaving(false);
      setError('');
      return true;
    } catch (e) {
      setError(messageOf(e));
      latest.current.editor.setNotice(`Could not clear the saved workspace: ${messageOf(e)}`);
      return false;
    } finally {
      clearingRef.current = false;
      setClearing(false);
    }
  }
  return { loading, saving, savedAt, error, clearing, clear };
}
