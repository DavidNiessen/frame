import { defaultSettings } from '../core/types';
import { useEffect, useRef, useState } from 'react';
import type { Editor } from './useEditor';
import type { EditSettings, MediaEngine } from '../core/types';
import type { PreviewProxy } from '../core/hardware';
import { useLoadingActivity } from './useLoadingActivity';
/** Independent engine jobs keep zoom, painting and controls responsive during rendering. */
export function useImageRender(
  editor: Editor,
  interactionEdit?: EditSettings,
  interactionKey = '',
) {
  const latest = useRef({ editor, interactionEdit, interactionKey });
  latest.current = { editor, interactionEdit, interactionKey };
  const key = JSON.stringify({
    id: editor.asset?.id,
    edit: editor.edit,
    interactionEdit,
    interactionKey,
  });
  const [ready, setReady] = useState<{
    key: string;
    source: string;
    proxy: PreviewProxy;
    base?: PreviewProxy;
    interactionKey: string;
    engine: MediaEngine;
  } | null>(null);
  const original = useRef<{ proxy: PreviewProxy; engine: MediaEngine } | null>(null);
  const [originalUrl, setOriginalUrl] = useState('');
  useEffect(
    () => () => {
      const current = original.current;
      original.current = null;
      if (current) void current.engine.releaseProxy?.(current.proxy.id).catch(() => {});
    },
    [],
  );
  const [status, setStatus] = useState({ key: '', error: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(
    () => () => {
      if (ready) {
        void ready.engine.releaseProxy?.(ready.proxy.id).catch(() => {});
        if (ready.base) void ready.engine.releaseProxy?.(ready.base.id).catch(() => {});
      }
    },
    [ready],
  );
  useEffect(() => {
    let stale = false,
      complete = false,
      engine: MediaEngine | undefined;
    setStatus({ key, error: '' });
    const timer = setTimeout(
      () =>
        void (async () => {
          const created: PreviewProxy[] = [];
          try {
            const request = latest.current;
            const { asset, edit } = request.editor;
            if (!asset || !edit || asset.kind !== 'image') return;
            engine = await request.editor.backgroundEngine();
            if (stale) return;
            if (!engine.effectPreview) throw new Error('Image preview is unavailable.');
            if (!original.current) {
              const proxy = await engine.effectPreview(asset, defaultSettings(asset), () => {});
              if (stale) {
                await engine.releaseProxy?.(proxy.id);
                return;
              }
              original.current = { proxy, engine };
              setOriginalUrl(proxy.url);
            }
            const proxy = await engine.effectPreview(asset, edit, () => {});
            created.push(proxy);
            if (stale) return;
            const base = request.interactionEdit
              ? await engine.effectPreview(asset, request.interactionEdit, () => {})
              : undefined;
            if (base) created.push(base);
            if (stale) return;
            complete = true;
            setReady({
              key,
              source: asset.id,
              proxy,
              base,
              interactionKey: request.interactionKey,
              engine,
            });
          } catch (error) {
            if (!stale) setStatus({ key, error: (error as Error).message });
          } finally {
            if (!complete)
              for (const proxy of created) await engine?.releaseProxy?.(proxy.id).catch(() => {});
          }
        })(),
      180,
    );
    return () => {
      stale = true;
      clearTimeout(timer);
      if (engine && !complete) engine.cancelJoinedPreview?.();
    };
  }, [key, attempt]);
  const preparing = ready?.key !== key && !(status.key === key && status.error);
  useLoadingActivity(preparing, 'Rendering image…', { priority: 1 });
  return {
    url: ready && ready.source === editor.asset?.id ? ready.proxy.url : editor.asset?.previewUrl,
    base:
      ready && ready.source === editor.asset?.id && ready.interactionKey === interactionKey
        ? ready.base?.url
        : undefined,
    preparing,
    original: originalUrl,
    error: status.key === key ? status.error : '',
    retry: () => setAttempt((x) => x + 1),
  };
}
