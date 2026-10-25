import { useEffect, useMemo, useRef, useState } from 'react';
import { joinedPreviewRanges, previewCoversRanges } from '../core/joined-preview';
import {
  audioPreviewAsset,
  effectPreviewNeeds,
  effectPreviewRecipe,
  effectPreviewRanges,
} from '../core/effect-preview';
import { allAudioLayers } from '../core/effect-instances';
import { liveMediaLayers } from '../core/live-media-layers';
import type { PreviewProxy } from '../core/hardware';
import type { PreviewRange } from '../core/preview-clock';
import type { EditSettings, MediaEngine } from '../core/types';
import type { Editor } from './useEditor';
import { previewCache } from '../core/preview-cache';
import { realtimeGradeFor } from '../engines/grade-renderer';

interface ReadyPreview {
  key: string;
  assetId: string;
  proxy: PreviewProxy;
  ranges: PreviewRange[];
  effects: boolean;
  geometry: boolean;
  engine: MediaEngine;
  release: () => void;
}

/** One background stream owns cuts and export-quality corrections, with safe playback handoffs. */
export function useJoinedPreview(editor: Editor, enabled = true) {
  const plan = useMemo(() => {
    if (!editor.asset || !editor.edit) return null;
    const asset = editor.asset,
      edit = editor.edit,
      realtimeVideo = realtimeGradeFor(asset),
      liveLayers = liveMediaLayers(asset, edit, editor.assets, realtimeVideo);
    const needs = effectPreviewNeeds(edit, !!globalThis.AudioContext, realtimeVideo, liveLayers);
    // Audio-only corrections render just the soundtrack; the video keeps playing its source.
    const split = asset.kind === 'video' && needs.audio && !needs.video;
    return {
      recipe:
        needs.video || (needs.audio && !split)
          ? effectPreviewRecipe(asset, edit, realtimeVideo, liveLayers)
          : null,
      audio:
        split && (asset.hasAudio || allAudioLayers(edit).length > 0)
          ? effectPreviewRecipe(audioPreviewAsset(asset), edit, true)
          : null,
    };
  }, [editor.asset, editor.edit, editor.assets]);
  const recipe = plan?.recipe ?? null,
    audioRecipe = plan?.audio ?? null;
  const ranges = useMemo(
    () =>
      editor.edit
        ? recipe
          ? effectPreviewRanges(recipe)
          : joinedPreviewRanges(editor.edit)
        : null,
    [editor.edit, recipe],
  );
  const audioRanges = useMemo(
    () => (audioRecipe ? effectPreviewRanges(audioRecipe) : null),
    [audioRecipe],
  );
  const effects = !!recipe;
  const key = useMemo(
    () =>
      enabled && editor.asset && ranges
        ? JSON.stringify({ assetId: editor.asset.id, ranges, recipe })
        : '',
    [enabled, editor.asset, ranges, recipe],
  );
  const audioKey = useMemo(
    () =>
      enabled && editor.asset && audioRanges
        ? JSON.stringify({ assetId: editor.asset.id, ranges: audioRanges, audio: audioRecipe })
        : '',
    [enabled, editor.asset, audioRanges, audioRecipe],
  );
  const jobKey = key || audioKey ? `${key}\n${audioKey}` : '';
  const latest = useRef(editor);
  latest.current = editor;
  const [state, setState] = useState<{ key: string; error?: string; done?: boolean }>({ key: '' });
  const [ready, setReady] = useState<ReadyPreview | null>(null);
  const [audioReady, setAudioReady] = useState<ReadyPreview | null>(null);
  const [cache] = useState(() => previewCache<ReadyPreview>());
  const [audioCache] = useState(() => previewCache<ReadyPreview>());
  const [attempt, retry] = useState(0);
  useEffect(() => {
    cache.retainAsset(editor.asset?.id);
    audioCache.retainAsset(editor.asset?.id);
  }, [cache, audioCache, editor.asset?.id]);
  // Trim only after React has switched/detached the previous stream.
  useEffect(() => {
    cache.trim(ready?.key ?? '');
  }, [cache, ready]);
  useEffect(() => {
    audioCache.trim(audioReady?.key ?? '');
  }, [audioCache, audioReady]);
  useEffect(
    () => () => {
      cache.clear();
      audioCache.clear();
    },
    [cache, audioCache],
  );
  useEffect(() => {
    if (!key) setReady(null);
    if (!audioKey) setAudioReady(null);
    if (!jobKey) {
      setState({ key: '' });
      return;
    }
    const parts = [
      { key, cache, show: setReady, audio: false },
      { key: audioKey, cache: audioCache, show: setAudioReady, audio: true },
    ].filter((part) => {
      if (!part.key) return false;
      const cached = part.cache.get(part.key);
      if (cached) part.show(cached);
      return !cached;
    });
    if (!parts.length) {
      setState({ key: jobKey, done: true });
      return;
    }
    let stale = false,
      running = false,
      engine: MediaEngine | undefined;
    const source = latest.current.asset!;
    setState({ key: jobKey });
    const timer = setTimeout(() => {
      void (async () => {
        try {
          engine = await latest.current.backgroundEngine();
          // The engine owns one preview job, so the parts render in turn.
          for (const part of parts) {
            if (stale) return;
            const request = JSON.parse(part.key) as {
              ranges: PreviewRange[];
              recipe?: EditSettings | null;
              audio?: EditSettings;
            };
            const settings = part.audio ? request.audio! : request.recipe,
              asset = part.audio ? audioPreviewAsset(source) : source;
            const progress = () => {}; // The shared activity beam stays smooth without progress-driven renders.
            let proxy: PreviewProxy;
            running = true;
            if (settings) {
              if (!engine.effectPreview) throw new Error('Effects preview is unavailable.');
              proxy = await engine.effectPreview(asset, settings, progress);
            } else {
              if (!engine.joinedPreview) throw new Error('Continuous preview is unavailable.');
              proxy = await engine.joinedPreview(asset, request.ranges, progress);
            }
            running = false;
            if (stale) {
              await engine.releaseProxy?.(proxy.id);
              return;
            }
            const owner = engine;
            const ready: ReadyPreview = {
              key: part.key,
              assetId: source.id,
              proxy,
              ranges: request.ranges,
              effects: !!settings,
              geometry: !!settings?.mediaLayers?.length,
              engine,
              release: () => {
                void owner.releaseProxy?.(proxy.id).catch(() => {});
              },
            };
            part.cache.put(ready);
            part.show(ready);
          }
          setState({ key: jobKey, done: true });
        } catch (error) {
          if (!stale)
            setState({
              key: jobKey,
              error: error instanceof Error ? error.message : String(error),
            });
        }
      })();
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
      if (engine && running) engine.cancelJoinedPreview?.();
    };
  }, [jobKey, key, audioKey, attempt, cache, audioCache]);
  const matched = state.key === jobKey,
    preview =
      key &&
      ready &&
      ready.assetId === editor.asset?.id &&
      ranges &&
      previewCoversRanges(ready.ranges, ranges) &&
      (ready.effects ? effects : true)
        ? ready
        : null,
    audio =
      audioKey &&
      audioReady &&
      audioReady.assetId === editor.asset?.id &&
      audioRanges &&
      previewCoversRanges(audioReady.ranges, audioRanges)
        ? audioReady
        : null;
  return {
    proxy: preview?.proxy,
    ranges: preview?.ranges,
    /** Processed soundtrack played beside the source video, in its own output timeline. */
    audio: audio ? { url: audio.proxy.url, ranges: audio.ranges } : undefined,
    processed: !!preview?.effects,
    geometryProcessed: !!preview?.geometry,
    effects: effects || !!audioRecipe,
    stale: (!!preview && preview.key !== key) || (!!audio && audio.key !== audioKey),
    preparing: !!jobKey && (!matched || (!state.done && !state.error)),
    error: matched ? state.error : undefined,
    retry: () => retry((value) => value + 1),
  };
}
