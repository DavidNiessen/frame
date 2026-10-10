import { useEffect, useMemo, useRef, useState } from 'react';
import { joinedPreviewRanges, previewCoversRanges } from '../core/joined-preview';
import type { PreviewProxy } from '../core/hardware';
import type { MediaEngine, TimeRange } from '../core/types';
import type { Editor } from './useEditor';

/** Retain the last ready stream while an independent worker prepares its replacement. */
export function useJoinedPreview(editor: Editor, enabled = true) {
  const ranges = useMemo(() => editor.edit ? joinedPreviewRanges(editor.edit) : null, [editor.edit]);
  const key = enabled && editor.asset && ranges ? `${editor.asset.id}:${JSON.stringify(ranges)}` : '';
  const latest = useRef(editor); latest.current = editor;
  const [state, setState] = useState<{ key: string; error?: string; progress: number; done?: boolean }>({ key: '', progress: 0 });
  const [ready, setReady] = useState<{ key: string; assetId: string; proxy: PreviewProxy; ranges: TimeRange[]; engine: MediaEngine } | null>(null);
  const [attempt, retry] = useState(0);
  // React has already switched/detached the player before releasing its previous stream.
  useEffect(() => () => { if (ready) void ready.engine.releaseProxy?.(ready.proxy.id).catch(() => {}); }, [ready]);
  useEffect(() => {
    if (!key) { setState({ key: '', progress: 0 }); setReady(null); return; }
    let stale = false, completed = false, engine: MediaEngine | undefined;
    const asset = latest.current.asset!, recipe = JSON.parse(key.slice(asset.id.length + 1)) as TimeRange[];
    setState({ key, progress: 0 });
    const timer = setTimeout(() => {
      void (async () => {
        try {
          engine = await latest.current.backgroundEngine();
          if (stale) return;
          if (!engine.joinedPreview) throw new Error('Continuous preview is unavailable.');
          const proxy = await engine.joinedPreview(asset, recipe, p => { if (!stale) setState({ key, progress: p.ratio }); });
          completed = true;
          if (stale) { await engine.releaseProxy?.(proxy.id); return; }
          setReady({ key, assetId: asset.id, proxy, ranges: recipe, engine });
          setState({ key, progress: 1, done: true });
        } catch (error) { if (!stale) setState({ key, progress: 0, error: error instanceof Error ? error.message : String(error) }); }
      })();
    }, 300);
    return () => { stale = true; clearTimeout(timer); if (engine && !completed) engine.cancelJoinedPreview?.(); };
  }, [key, attempt]);
  const matched = state.key === key, preview = key && ready && ready.assetId === editor.asset?.id && ranges && previewCoversRanges(ready.ranges, ranges) ? ready : null;
  return { proxy: preview?.proxy, ranges: preview?.ranges, stale: !!preview && preview.key !== key,
    preparing: !!key && (!matched || (!state.done && !state.error)), progress: matched ? state.progress : 0,
    error: matched ? state.error : undefined, retry: () => retry(value => value + 1) };
}
