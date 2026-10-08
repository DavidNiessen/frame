import { useEffect, useRef, useState } from 'react';
import type { Editor } from './useEditor';
import type { PreviewProxy } from '../core/hardware';
export function useProxies(editor: Editor) {
  const [cache, setCache] = useState<Record<string, PreviewProxy>>({}), [loading, setLoading] = useState(false), [error, setError] = useState(''); const ref = useRef(cache); ref.current = cache;
  useEffect(() => { setCache(old => Object.fromEntries(Object.entries(old).filter(([id]) => editor.assets.some(a => a.id === id)))); }, [editor.assets]);
  useEffect(() => { setError(''); }, [editor.asset?.id]);
  useEffect(() => () => { for (const proxy of Object.values(ref.current)) void window.frameDesktop?.releaseProxy(proxy.id); }, []);
  async function generate() {
    if (!editor.asset || editor.busy || editor.platform !== 'desktop') return; setLoading(true); setError('');
    try { const source = editor.asset; const proxy = await editor.runExclusive('analysis', e => { if (!e.previewProxy) throw new Error('Preview proxies require desktop.'); return e.previewProxy(source, () => {}); }); setCache(old => ({ ...old, [source.id]: proxy })); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }
  async function clear() {
    const source = editor.asset; if (!source || editor.busy) return; const proxy = cache[source.id];
    setCache(old => { const next = { ...old }; delete next[source.id]; return next; });
    try { if (proxy) await window.frameDesktop?.releaseProxy(proxy.id); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  return { proxy: editor.asset ? cache[editor.asset.id] : undefined, loading, error, generate, clear };
}
export type Proxies = ReturnType<typeof useProxies>;
