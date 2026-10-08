import { useEffect, useRef, useState } from 'react';
import type { Editor } from './useEditor';
export function useThumbnails(editor: Editor) {
  const [strips, setStrips] = useState<Record<string, string>>({}); const refs = useRef(strips); refs.current = strips;
  const [loading, setLoading] = useState(false); const [progress, setProgress] = useState(0);
  useEffect(() => () => { for (const url of Object.values(refs.current)) URL.revokeObjectURL(url); }, []);
  useEffect(() => {
    const ids = new Set(editor.assets.map(a => a.id));
    for (const [id, url] of Object.entries(refs.current)) if (!ids.has(id)) URL.revokeObjectURL(url);
    setStrips(current => Object.keys(current).some(id => !ids.has(id)) ? Object.fromEntries(Object.entries(current).filter(([id]) => ids.has(id))) : current);
  }, [editor.assets]);
  async function generate() {
    const asset = editor.asset; if (asset?.kind !== 'video' || editor.busy) return;
    setLoading(true); setProgress(0);
    try {
      const url = await editor.runExclusive('analysis', engine => engine.thumbnails(asset, p => setProgress(p.ratio)));
      setStrips(current => ({ ...current, [asset.id]: url })); editor.setNotice('Timeline thumbnails ready. Frames show the original source.');
    } catch (error) { editor.setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setLoading(false); }
  }
  return { url: editor.asset ? strips[editor.asset.id] : undefined, loading, progress, generate };
}
