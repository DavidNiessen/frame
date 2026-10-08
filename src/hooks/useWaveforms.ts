import { useEffect, useState } from 'react';
import type { Editor } from './useEditor';
import type { WaveformPoint } from '../core/waveform';
export function useWaveforms(editor: Editor) {
  const [waveforms, setWaveforms] = useState<Record<string, WaveformPoint[]>>({});
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const ids = new Set(editor.assets.map(a => a.id));
    setWaveforms(current => Object.keys(current).some(id => !ids.has(id)) ? Object.fromEntries(Object.entries(current).filter(([id]) => ids.has(id))) : current);
  }, [editor.assets]);
  const [progress, setProgress] = useState(0);
  async function generate() {
    const asset = editor.asset; if (!asset?.hasAudio || editor.busy) return;
    setProgress(0); setLoading(true);
    try {
      const points = await editor.runExclusive('analysis', engine => engine.waveform(asset, p => setProgress(p.ratio)));
      setWaveforms(current => ({ ...current, [asset.id]: points }));
      editor.setNotice('Audio waveform ready. Peaks show the original source.');
    } catch (error) { editor.setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setLoading(false); }
  }
  return { points: editor.asset ? waveforms[editor.asset.id] : undefined, generate, progress, loading };
}
