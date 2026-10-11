import { useEffect, useMemo, useRef, useState } from 'react';
import { joinedPreviewRanges, previewCoversRanges } from '../core/joined-preview';
import {
  effectPreviewRecipe,
  effectPreviewRanges,
  needsEffectPreview,
} from '../core/effect-preview';
import type { PreviewProxy } from '../core/hardware';
import type { PreviewRange } from '../core/preview-clock';
import type { EditSettings, MediaEngine } from '../core/types';
import type { Editor } from './useEditor';

/** One background stream owns cuts and export-quality corrections, with safe playback handoffs. */
export function useJoinedPreview(editor: Editor, enabled = true) {
  const recipe = useMemo(
    () =>
      editor.asset && editor.edit && needsEffectPreview(editor.edit)
        ? effectPreviewRecipe(editor.asset, editor.edit)
        : null,
    [editor.asset, editor.edit],
  );
  const ranges = useMemo(
    () =>
      editor.edit
        ? recipe
          ? effectPreviewRanges(recipe)
          : joinedPreviewRanges(editor.edit)
        : null,
    [editor.edit, recipe],
  );
  const effects = !!recipe,
    key =
      enabled && editor.asset && ranges
        ? JSON.stringify({ assetId: editor.asset.id, ranges, recipe })
        : '';
  const latest = useRef(editor);
  latest.current = editor;
  const [state, setState] = useState<{ key: string; error?: string; done?: boolean }>({ key: '' });
  const [ready, setReady] = useState<{
    key: string;
    assetId: string;
    proxy: PreviewProxy;
    ranges: PreviewRange[];
    effects: boolean;
    engine: MediaEngine;
  } | null>(null);
  const [attempt, retry] = useState(0);
  // React has already switched/detached the player before releasing its previous stream.
  useEffect(
    () => () => {
      if (ready) void ready.engine.releaseProxy?.(ready.proxy.id).catch(() => {});
    },
    [ready],
  );
  useEffect(() => {
    if (!key) {
      setState({ key: '' });
      setReady(null);
      return;
    }
    let stale = false,
      completed = false,
      engine: MediaEngine | undefined;
    const asset = latest.current.asset!,
      request = JSON.parse(key) as { ranges: PreviewRange[]; recipe: EditSettings | null };
    setState({ key });
    const timer = setTimeout(() => {
      void (async () => {
        try {
          engine = await latest.current.backgroundEngine();
          if (stale) return;
          const progress = () => {}; // The shared activity beam stays smooth without progress-driven renders.
          let proxy: PreviewProxy;
          if (request.recipe) {
            if (!engine.effectPreview) throw new Error('Effects preview is unavailable.');
            proxy = await engine.effectPreview(asset, request.recipe, progress);
          } else {
            if (!engine.joinedPreview) throw new Error('Continuous preview is unavailable.');
            proxy = await engine.joinedPreview(asset, request.ranges, progress);
          }
          completed = true;
          if (stale) {
            await engine.releaseProxy?.(proxy.id);
            return;
          }
          setReady({
            key,
            assetId: asset.id,
            proxy,
            ranges: request.ranges,
            effects: !!request.recipe,
            engine,
          });
          setState({ key, done: true });
        } catch (error) {
          if (!stale)
            setState({ key, error: error instanceof Error ? error.message : String(error) });
        }
      })();
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
      if (engine && !completed) engine.cancelJoinedPreview?.();
    };
  }, [key, attempt]);
  const matched = state.key === key,
    preview =
      key &&
      ready &&
      ready.assetId === editor.asset?.id &&
      ranges &&
      previewCoversRanges(ready.ranges, ranges) &&
      (ready.effects ? effects : true)
        ? ready
        : null;
  return {
    proxy: preview?.proxy,
    ranges: preview?.ranges,
    processed: !!preview?.effects,
    effects,
    stale: !!preview && preview.key !== key,
    preparing: !!key && (!matched || (!state.done && !state.error)),
    error: matched ? state.error : undefined,
    retry: () => retry((value) => value + 1),
  };
}
