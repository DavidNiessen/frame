import { allAudioLayers } from '../core/effect-instances';
import { audioLayerSource } from '../core/audio-layers';
import type { MediaAsset } from '../core/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from './useEditor';
import type { WaveformPoint } from '../core/waveform';
export function useWaveforms(editor: Editor, enabled = true, autoWaveforms = true) {
  const [waveforms, setWaveforms] = useState<Record<string, WaveformPoint[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false), [progress, setProgress] = useState(0);
  const attempted = useRef(new Set<string>()), cancelled = useRef(false);
  const job = useRef<{ id: string; automatic: boolean } | null>(null);
  const automaticAllowed = useRef(autoWaveforms); automaticAllowed.current = autoWaveforms;
  const latest = useRef(editor); latest.current = editor;
  useEffect(() => {
    const ids = new Set(editor.assets.map(a => a.id));
    const keep = <T,>(current: Record<string, T>) => Object.keys(current).some(id => !ids.has(id)) ? Object.fromEntries(Object.entries(current).filter(([id]) => ids.has(id))) : current;
    setWaveforms(keep); setErrors(keep);
    if (job.current && !ids.has(job.current.id)) { cancelled.current = true; void latest.current.backgroundEngine().then(engine => engine.cancelWaveform?.()); }
    for (const id of attempted.current) if (!ids.has(id)) attempted.current.delete(id);
  }, [editor.assets]);
  const generate = useCallback(async (automatic = false, requested?: MediaAsset) => {
    const current = latest.current, asset = requested ?? current.asset;
    if (!asset?.hasAudio || job.current || current.busy || (automatic && !automaticAllowed.current)) return;
    attempted.current.add(asset.id); cancelled.current = false;
    job.current = { id: asset.id, automatic };
    setProgress(0); setLoading(true);
    setErrors(errors => { const next = { ...errors }; delete next[asset.id]; return next; });
    try {
      const points = await (await current.backgroundEngine()).waveform(asset, p => setProgress(p.ratio));
      if (cancelled.current || !latest.current.assets.some(item => item.id === asset.id)) return;
      setWaveforms(waves => ({ ...waves, [asset.id]: points }));
      if (!automatic) current.setNotice('Audio waveform ready. Peaks follow your timeline sections.');
    } catch (error) {
      const message = cancelled.current ? 'Waveform generation cancelled.' : error instanceof Error ? error.message : String(error);
      setErrors(errors => ({ ...errors, [asset.id]: message }));
      if (!automatic) current.setNotice(message);
    } finally { job.current = null; setLoading(false); }
  }, []);
  useEffect(() => {
    if (!autoWaveforms && job.current?.automatic) {
      cancelled.current = true;
      // Re-enabling the preference may restart an analysis interrupted by this setting.
      attempted.current.delete(job.current.id);
      void latest.current.backgroundEngine().then(engine => engine.cancelWaveform?.());
    }
  }, [autoWaveforms]);
  useEffect(() => {
    const targets = [...(editor.asset?.kind === 'audio' ? [editor.asset] : []), ...(editor.edit ? allAudioLayers(editor.edit) : []).flatMap(layer => { const source = audioLayerSource(layer, editor.assets); return source ? [source] : []; })];
    // A single queue serves main and additional tracks, including the independent WASM worker.
    const asset = targets.find(asset => asset.hasAudio && !waveforms[asset.id] && !attempted.current.has(asset.id));
    if (enabled && autoWaveforms && asset && !editor.busy && !job.current) void generate(true, asset);
  }, [enabled, autoWaveforms, editor.asset, editor.edit?.audioLayers, editor.edit?.effectInstances, editor.assets, editor.busy, waveforms, loading, generate]);
  useEffect(() => () => { cancelled.current = true; void latest.current.backgroundEngine().then(engine => engine.cancelWaveform?.()); }, []);
  return { all: waveforms, generatingId: job.current?.id ?? null, points: editor.asset ? waveforms[editor.asset.id] : undefined, error: editor.asset ? errors[editor.asset.id] : undefined,
    generate, progress, loading: loading && job.current?.id === editor.asset?.id, cancel: () => { cancelled.current = true; void latest.current.backgroundEngine().then(engine => engine.cancelWaveform?.()); } };
}
