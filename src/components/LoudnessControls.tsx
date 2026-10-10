import { TransientMessage } from './TransientMessage';
import { useEffect, useState } from 'react';
import type { Editor } from '../hooks/useEditor';
import type { LoudnessStats } from '../core/loudness';
export function LoudnessControls({ editor }: { editor: Editor }) {
  const [stats, setStats] = useState<LoudnessStats | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState('');
  useEffect(() => { setStats(null); setError(''); }, [editor.asset?.id, editor.edit]);
  async function measure() {
    if (!editor.asset || !editor.edit || editor.busy || loading) return; setLoading(true); setError('');
    try { setStats(await editor.runExclusive('analysis', engine => engine.measureLoudness(editor.asset!, editor.edit!, () => {}))); }
    catch (issue) { setError((issue as Error).message); } finally { setLoading(false); }
  }
  return <div className="loudness-controls"><button className="button subtle small" disabled={loading || !!editor.busy} onClick={() => void measure()}>{loading ? 'Measuring…' : 'Measure edited loudness'}</button>{stats && <div className="loudness-report" aria-label="Edited audio loudness"><dl><div><dt>Integrated</dt><dd>{stats.integrated === null ? 'Silence' : `${stats.integrated.toFixed(1)} LUFS`}</dd></div><div><dt>Loudness range</dt><dd>{stats.range === null ? '—' : `${stats.range.toFixed(1)} LU`}</dd></div><div><dt>True peak</dt><dd>{stats.truePeak === null ? 'Silence' : `${stats.truePeak.toFixed(1)} dBTP`}</dd></div></dl>{stats.truePeak !== null && <><div className={`loudness-peak ${stats.truePeak >= 0 ? 'clipping' : ''}`} role="meter" aria-label="True peak level" aria-valuemin={-60} aria-valuemax={0} aria-valuenow={Math.max(-60, Math.min(0, stats.truePeak))} aria-valuetext={`${stats.truePeak.toFixed(1)} dBTP`}><span style={{ width: `${Math.max(0, Math.min(100, (stats.truePeak + 60) / 60 * 100))}%` }} /></div><p className="field-note">{stats.truePeak >= 0 ? 'Clipping risk: reduce gain or enable loudness normalization.' : stats.truePeak > -1 ? 'Less than 1 dB of headroom. Consider lowering gain before encoding.' : 'The edited audio has headroom below full scale.'}</p></>}</div>}{error && <TransientMessage role="alert">{error}</TransientMessage>}<p className="field-note">Measures the full edited audio, including clip effects, cuts, speed and fades. Re-measure after changing settings.</p></div>;
}
