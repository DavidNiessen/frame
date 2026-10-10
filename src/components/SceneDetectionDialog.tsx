import { TransientMessage } from './TransientMessage';
import { useEffect, useRef, useState } from 'react';
import { ScanLine, X } from 'lucide-react';
import { defaultSceneOptions, splitAtScenes, type SceneScan } from '../core/scenes';
import { editClips } from '../core/clips';
import { preciseTimecode } from '../core/playhead';
import type { Editor } from '../hooks/useEditor';
export function SceneDetectionDialog({ editor, seek, close }: { editor: Editor; seek: (time: number) => void; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), [options, setOptions] = useState(defaultSceneOptions), [scan, setScan] = useState<SceneScan | null>(null), [loading, setLoading] = useState(false), [progress, setProgress] = useState(0), [error, setError] = useState(''), [selected, setSelected] = useState<number[]>([]), [retainedOnly, setRetainedOnly] = useState(true);
  const edit = editor.edit!, asset = editor.asset!, visible = scan?.times.filter(time => !retainedOnly || editClips(edit).some(clip => time >= clip.start && time < clip.end)) ?? [], chosen = visible.filter(time => selected.includes(time));
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => { setScan(null); setSelected([]); }, [options]);
  async function detect() {
    if (editor.busy || loading) return; setLoading(true); setProgress(0); setError('');
    try { const scan = await editor.runExclusive('analysis', engine => engine.detectScenes(asset, options, p => setProgress(p.ratio))); setScan(scan); setSelected(scan.times); }
    catch (issue) { setError((issue as Error).message); } finally { setLoading(false); }
  }
  function apply() {
    try {
      const patch = splitAtScenes(edit, chosen); editor.update(patch);
      editor.setNotice(patch.clips ? 'Selected scene changes split into clips. Existing clip effects are preserved.' : 'The selected scene boundaries are already split.'); close();
    } catch (issue) { setError((issue as Error).message); }
  }
  return <dialog ref={dialog} className="shortcuts-dialog scene-dialog" aria-label="Find scene changes" onCancel={event => { if (loading) event.preventDefault(); else close(); }}><div className="dialog-heading"><h2><ScanLine size={18} />Find scene changes</h2><button className="icon-button" aria-label="Close scene detection" disabled={loading} onClick={close}><X size={18} /></button></div><p>Find likely cut points, review them, then split the footage.</p><fieldset disabled={loading || !!editor.busy} className="scene-options"><label className="stacked-label">Change threshold · {options.threshold.toFixed(2)}<input type="range" aria-label="Scene change threshold" min={.05} max={.9} step={.01} value={options.threshold} onChange={event => setOptions({ ...options, threshold: Number(event.target.value) })} /></label><p className="field-note">Lower thresholds find more changes; fades and motion may also be detected.</p><label className="stacked-label">Minimum gap between scenes<input type="number" aria-label="Minimum scene gap" min={.1} max={10} step={.1} value={options.minGap} onChange={event => setOptions({ ...options, minGap: Number(event.target.value) })} /></label></fieldset><div className="scene-scan-actions">{loading ? <><span role="status">Scanning {Math.round(progress * 100)}%</span><button className="button subtle small" onClick={editor.cancel}>Cancel scan</button></> : <button className="button primary small" disabled={!!editor.busy} onClick={() => void detect()}>{scan ? 'Scan again' : 'Detect scene changes'}</button>}</div>{scan && <><div className="scene-result-heading"><strong>{visible.length} changes · {chosen.length} selected</strong><label><input type="checkbox" checked={retainedOnly} onChange={event => setRetainedOnly(event.target.checked)} />Retained footage only</label></div>{scan.truncated && <p>Showing the first 500 changes. Raise the threshold or minimum gap to narrow the scan.</p>}<div className="scene-selection-tools"><button className="button subtle small" onClick={() => setSelected(visible)}>Select all changes</button><button className="button subtle small" onClick={() => setSelected([])}>Deselect changes</button></div><div className="scene-results">{visible.map((time, index) => <div key={time}><label><input type="checkbox" aria-label={`Use scene change ${index + 1}`} checked={selected.includes(time)} onChange={event => setSelected(current => event.target.checked ? [...current, time] : current.filter(value => value !== time))} />Scene {index + 1}</label><button title="Preview this source position" onClick={() => seek(time)}>{preciseTimecode(time)}</button></div>)}</div>{!visible.length && <p>No changes matched these settings. Try a lower threshold.</p>}<div className="project-actions"><button className="button primary small" disabled={!chosen.length || !!editor.busy} onClick={apply}>Split at selected changes</button></div></>}{error && <TransientMessage role="alert">{error}</TransientMessage>}</dialog>;
}
