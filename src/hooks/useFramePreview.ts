import { useEffect, useRef, useState } from 'react';
import type { Editor } from './useEditor';
export function useFramePreview(editor: Editor, time: number) {
  const [url, setUrl] = useState<string | null>(null); const ref = useRef(url); ref.current = url;
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  useEffect(() => { if (ref.current) URL.revokeObjectURL(ref.current); setUrl(null); setError(''); }, [editor.asset?.id, editor.edit, time]);
  useEffect(() => () => { if (ref.current) URL.revokeObjectURL(ref.current); }, []);
  async function generate() {
    if (!editor.asset || !editor.edit || editor.busy) return; setLoading(true); setError('');
    try { const next = await editor.runExclusive('analysis', engine => engine.previewFrame(editor.asset!, editor.edit!, Math.max(0, Math.min(editor.asset!.duration - .05, time)), () => {})); if (ref.current) URL.revokeObjectURL(ref.current); setUrl(next); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }
  return { url, loading, error, generate };
}
