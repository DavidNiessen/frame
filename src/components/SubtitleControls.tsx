import { useRef, useState } from 'react';
import { importSubtitles, outputCues, serializeSrt } from '../core/subtitles';
import type { EditSettings } from '../core/types';
export function SubtitleControls({ edit, update }: { edit: EditSettings; update: (patch: Partial<EditSettings>) => void }) {
  const input = useRef<HTMLInputElement>(null); const [error, setError] = useState(''); const s = edit.subtitles;
  const change = (index: number, patch: Partial<typeof s.cues[number]>) => update({ subtitles: { ...s, cues: s.cues.map((c, i) => i === index ? { ...c, ...patch } : c) } });
  return <details className="advanced"><summary>Subtitles</summary><div className="advanced-content">
    <input ref={input} type="file" accept=".srt,.vtt" hidden aria-label="Import subtitle file" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; void file.text().then(text => { update({ subtitles: importSubtitles(text) }); setError(''); }).catch(e => setError(e.message)); }} />
    <button className="button subtle small" onClick={() => input.current?.click()}>Import SRT / VTT</button>
    <label className="stacked-label">Subtitle export<select value={s.mode} onChange={e => update({ subtitles: { ...s, mode: e.target.value as typeof s.mode } })}><option value="none">Off</option><option value="burn">Burn into video</option><option value="embed">Embed selectable captions</option></select></label>
    <div className="cue-list">{s.cues.map((c, i) => <div className="cue" key={i}><span className="cue-timing">Caption {i + 1} · {c.start.toFixed(2)}–{c.end.toFixed(2)}s</span><textarea aria-label={`Subtitle ${i + 1} text`} maxLength={2000} value={c.text} onChange={e => change(i, { text: e.target.value })} />{c.position && <button className="button subtle small" onClick={() => change(i, { position: undefined })}>Reset caption {i + 1} position</button>}<button className="button subtle small" onClick={() => update({ subtitles: { ...s, cues: s.cues.filter((_, j) => i !== j) } })}>Remove cue {i + 1}</button></div>)}</div>
    <button className="button subtle small" disabled={s.cues.length >= 1000} onClick={() => update({ subtitles: { mode: s.mode === 'none' ? 'burn' : s.mode, cues: [...s.cues, { start: edit.start, end: Math.min(edit.end, edit.start + 2), text: 'New caption' }] } })}>Add caption</button>
    {s.cues.length > 0 && <button className="button subtle small" onClick={() => { const url = URL.createObjectURL(new Blob([serializeSrt(outputCues(edit))], { type: 'text/plain' })); const a = document.createElement('a'); a.href = url; a.download = 'captions.srt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); }}>Save output SRT</button>}
    <p className="field-note">Drag captions in the preview to place them. Arrow keys nudge; Shift moves faster. Placement applies to burned-in captions. Selectable captions and SRT files use the player's layout.</p>
    <p className="field-note">Drag caption bar edges above the timeline to adjust timing. Cue times refer to the source. Trimming, removed sections and speed changes adjust export timing automatically. Embedded captions require MP4, MOV, MKV or WebM.</p>{error && <p role="alert">{error}</p>}
  </div></details>;
}
