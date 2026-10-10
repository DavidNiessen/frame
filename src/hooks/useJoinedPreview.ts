import { useEffect, useMemo, useRef, useState } from 'react';
import { joinedPreviewRanges } from '../core/joined-preview';
import type { PreviewProxy } from '../core/hardware';
import type { TimeRange } from '../core/types';
import type { Editor } from './useEditor';

export function useJoinedPreview(editor: Editor, enabled = true) {
  const ranges = useMemo(() => editor.edit ? joinedPreviewRanges(editor.edit) : null, [editor.edit]);
  const key = enabled && editor.asset && ranges ? `${editor.asset.id}:${JSON.stringify(ranges)}` : '';
  const latest = useRef(editor); latest.current = editor;
  const [state, setState] = useState<{ key: string; proxy?: PreviewProxy; ranges?: TimeRange[]; error?: string; progress: number }>({ key: '', progress: 0 });
  const [attempt, retry] = useState(0);
  useEffect(() => {
    if (!key) { setState({ key: '', progress: 0 }); return; }
    let stale = false, proxy: PreviewProxy | undefined, started = false;
    const asset = latest.current.asset!, recipe = JSON.parse(key.slice(asset.id.length + 1)) as TimeRange[];
    setState({ key, progress: 0 });
    const timer = setTimeout(() => {
      started = true;
      void (async () => {
        try {
          const engine = await latest.current.backgroundEngine();
          if (stale) return;
          if (!engine.joinedPreview) throw new Error('Continuous preview is unavailable.');
          proxy = await engine.joinedPreview(asset, recipe, p => { if (!stale) setState({ key, progress: p.ratio }); });
          if (stale) { await engine.releaseProxy?.(proxy.id); return; }
          setState({ key, proxy, ranges: recipe, progress: 1 });
        } catch (error) { if (!stale) setState({ key, progress: 0, error: error instanceof Error ? error.message : String(error) }); }
      })();
    }, 300);
    return () => {
      stale = true; clearTimeout(timer);
      void latest.current.backgroundEngine().then(async engine => { if (started && !proxy) engine.cancelJoinedPreview?.(); if (proxy) await engine.releaseProxy?.(proxy.id); }).catch(() => {});
    };
  }, [key, attempt]);
  const matched = state.key === key;
  return { proxy: matched ? state.proxy : undefined, ranges: matched ? state.ranges : undefined,
    preparing: !!key && (!matched || (!state.proxy && !state.error)), progress: matched ? state.progress : 0,
    error: matched ? state.error : undefined, retry: () => retry(value => value + 1) };
}
