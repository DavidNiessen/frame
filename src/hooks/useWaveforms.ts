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
    for (const id of attempted.current) if (!ids.has(id)) attempted.current.delete(id);
  }, [editor.assets]);
  const generate = useCallback(async (automatic = false) => {
    const current = latest.current, asset = current.asset;
    if (!asset?.hasAudio || current.busy || (automatic && !automaticAllowed.current)) return;
    attempted.current.add(asset.id); cancelled.current = false;
    job.current = { id: asset.id, automatic };
    setProgress(0); setLoading(true);
    setErrors(errors => { const next = { ...errors }; delete next[asset.id]; return next; });
    try {
      const points = await current.runExclusive('analysis', engine => engine.waveform(asset, p => setProgress(p.ratio)));
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
      latest.current.cancel();
    }
  }, [autoWaveforms]);
  useEffect(() => {
    const asset = editor.asset;
    // Mark attempts before awaiting the engine, so errors and cancellation never start a retry loop.
    if (enabled && autoWaveforms && asset?.kind === 'audio' && asset.hasAudio && !editor.busy && !waveforms[asset.id] && !attempted.current.has(asset.id)) void generate(true);
  }, [enabled, autoWaveforms, editor.asset, editor.busy, waveforms, generate]);
  return { points: editor.asset ? waveforms[editor.asset.id] : undefined, error: editor.asset ? errors[editor.asset.id] : undefined,
    generate, progress, loading, cancel: () => { cancelled.current = true; latest.current.cancel(); } };
}
