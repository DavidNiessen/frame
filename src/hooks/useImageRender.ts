import { defaultSettings } from '../core/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from './useEditor';
import type { EditSettings, MediaEngine } from '../core/types';
import type { PreviewProxy } from '../core/hardware';
import { useLoadingActivity } from './useLoadingActivity';
import { previewCache } from '../core/preview-cache';
import { imagePreviewKey } from '../core/image-preview-key';
interface CachedFrame {
  key: string;
  assetId: string;
  proxy: PreviewProxy;
  release: () => void;
}
/** Exact composites and object-free bases share a bounded cache through edits and undo. */
export function useImageRender(
  editor: Editor,
  interactionEdit?: EditSettings,
  interactionKey = '',
) {
  const latest = useRef(editor);
  latest.current = editor;
  const request = useMemo(
    () => ({ asset: editor.asset, edit: editor.edit, interactionEdit, interactionKey }),
    [editor.asset, editor.edit, interactionEdit, interactionKey],
  );
  const [cache] = useState(() => previewCache<CachedFrame>(8, 64 * 1024 * 1024));
  const hashes = useRef(new WeakMap<EditSettings, Promise<string>>());
  const pinned = useRef<readonly string[]>([]);
  const [ready, setReady] = useState<{
    request: typeof request;
    assetId: string;
    frame: CachedFrame;
    base?: CachedFrame;
    interactionKey: string;
  } | null>(null);
  const original = useRef<{
    assetId: string;
    key: string;
    proxy: PreviewProxy;
    engine: MediaEngine;
  } | null>(null);
  const [originalUrl, setOriginalUrl] = useState('');
  useEffect(() => {
    hashes.current = new WeakMap();
    cache.retainAsset(editor.asset?.id);
    const previous = original.current;
    if (previous && previous.assetId !== editor.asset?.id) {
      original.current = null;
      void previous.engine.releaseProxy?.(previous.proxy.id).catch(() => {});
      setOriginalUrl('');
    }
  }, [cache, editor.asset?.id]);
  useEffect(() => {
    pinned.current = ready ? [ready.frame.key, ...(ready.base ? [ready.base.key] : [])] : [];
    // Both visible images stay alive until React has completed the source handoff.
    cache.trim(pinned.current);
  }, [cache, ready]);
  useEffect(
    () => () => {
      cache.clear();
      const previous = original.current;
      original.current = null;
      if (previous) void previous.engine.releaseProxy?.(previous.proxy.id).catch(() => {});
    },
    [cache],
  );
  const [status, setStatus] = useState<{ request: typeof request | null; error: string }>({
    request: null,
    error: '',
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let stale = false,
      complete = false,
      processing = false,
      engine: MediaEngine | undefined;
    setStatus({ request, error: '' });
    const timer = setTimeout(
      () =>
        void (async () => {
          const { asset, edit } = request;
          if (!asset || !edit || asset.kind !== 'image') return;
          const key = (recipe: EditSettings) => {
            let pending = hashes.current.get(recipe);
            if (!pending) {
              pending = imagePreviewKey(asset, recipe);
              hashes.current.set(recipe, pending);
            }
            return pending;
          };
          const render = async (recipe: EditSettings) => {
            if (stale) throw new Error('Image preview cancelled.');
            const owner = engine ?? (await latest.current.backgroundEngine());
            engine = owner;
            if (stale) throw new Error('Image preview cancelled.');
            if (!owner.effectPreview) throw new Error('Image preview is unavailable.');
            processing = true;
            let proxy: PreviewProxy;
            try {
              proxy = await owner.effectPreview(asset, recipe, () => {});
            } finally {
              processing = false;
            }
            if (stale) {
              await owner.releaseProxy?.(proxy.id).catch(() => {});
              throw new Error('Image preview cancelled.');
            }
            return { proxy, engine: owner };
          };
          const frame = async (recipe: EditSettings): Promise<CachedFrame> => {
            const id = await key(recipe);
            if (stale) throw new Error('Image preview cancelled.');
            if (original.current?.key === id)
              return {
                key: id,
                assetId: asset.id,
                proxy: original.current.proxy,
                release: () => {},
              };
            const previous = cache.get(id);
            if (previous) return previous;
            const result = await render(recipe);
            const entry = {
              key: id,
              assetId: asset.id,
              proxy: result.proxy,
              release: () => {
                void result.engine.releaseProxy?.(result.proxy.id).catch(() => {});
              },
            };
            cache.put(entry);
            return entry;
          };
          try {
            if (!original.current) {
              const recipe = defaultSettings(asset),
                id = await key(recipe),
                result = await render(recipe);
              original.current = { assetId: asset.id, key: id, ...result };
              setOriginalUrl(result.proxy.url);
            }
            const full = await frame(edit);
            const base = request.interactionEdit ? await frame(request.interactionEdit) : undefined;
            if (stale) return;
            complete = true;
            setReady({
              request,
              assetId: asset.id,
              frame: full,
              base,
              interactionKey: request.interactionKey,
            });
          } catch (error) {
            if (!stale)
              setStatus({ request, error: error instanceof Error ? error.message : String(error) });
          } finally {
            if (!complete) cache.trim(pinned.current);
          }
        })(),
      180,
    );
    return () => {
      stale = true;
      clearTimeout(timer);
      if (engine && processing) engine.cancelJoinedPreview?.();
    };
  }, [request, attempt, cache]);
  const preparing = ready?.request !== request && !(status.request === request && status.error);
  useLoadingActivity(preparing, 'Rendering image…', { priority: 1 });
  const visible = ready?.assetId === editor.asset?.id ? ready : null;
  return {
    url: visible?.frame.proxy.url ?? editor.asset?.previewUrl,
    base: visible?.interactionKey === interactionKey ? visible?.base?.proxy.url : undefined,
    preparing,
    original: original.current?.assetId === editor.asset?.id ? originalUrl : '',
    error: status.request === request ? status.error : '',
    retry: () => setAttempt((value) => value + 1),
  };
}
