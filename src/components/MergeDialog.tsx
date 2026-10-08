import { useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowDown, GripVertical, X, Combine } from 'lucide-react';
import type { Editor } from '../hooks/useEditor';
import type { Merge } from '../hooks/useMerge';
import { availableFormats, getFormat } from '../core/formats';
import { outputSettings, type OutputSettings } from '../core/presets';
import { editedDuration } from '../core/timeline';
import { defaultSettings } from '../core/types';
export function MergeDialog({ open, close, editor, merge }: { open: boolean; close: () => void; editor: Editor; merge: Merge }) {
  const dialog = useRef<HTMLDialogElement>(null); const [ids, setIds] = useState<string[]>([]); const [settings, setSettings] = useState<OutputSettings | null>(null); const drag = useRef<number | null>(null);
  useEffect(() => { if (open && editor.asset && editor.edit) { setIds(editor.assets.map(a => a.id)); setSettings(outputSettings(editor.edit)); dialog.current?.showModal(); } else dialog.current?.close(); }, [open]);
  const clips = ids.map(id => editor.assets.find(a => a.id === id)!).filter(Boolean);
  const formats = availableFormats({ kind: clips.every(a => a.kind === 'video') ? 'video' : 'audio', hasAudio: clips.some(a => a.hasAudio) });
  const format = settings && formats.some(f => f.id === settings.format) ? settings.format : formats[0]?.id;
  const running = editor.busy === 'merge';
  function move(from: number, to: number) { setIds(current => { const next = [...current]; const [id] = next.splice(from, 1); next.splice(to, 0, id); return next; }); }
  return <dialog ref={dialog} className="shortcuts-dialog project-dialog" aria-labelledby="merge-title" onCancel={event => { if (running) event.preventDefault(); else close(); }}>
    <div className="dialog-heading"><h2 id="merge-title"><Combine size={18} />Merge clips</h2><button className="icon-button" aria-label="Close merge" disabled={running} onClick={close}><X size={18} /></button></div>
    <p className="project-intro">Arrange source clips below. Each keeps its current trims, cuts, crop, and volume. Video frames fit the first clip; missing video audio becomes silence.</p>
    <fieldset disabled={!!editor.busy}><ol className="merge-clips">{clips.map((asset, index) => <li key={`${asset.id}-${index}`} draggable={!editor.busy} onDragStart={event => { drag.current = index; event.dataTransfer.setData('application/x-frame-clip', String(index)); }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); event.stopPropagation(); if (drag.current !== null) move(drag.current, index); drag.current = null; }}><GripVertical size={15} /><span>{index + 1}. {asset.name}</span><button className="icon-button" aria-label={`Move clip ${index + 1} up`} disabled={index === 0} onClick={() => move(index, index - 1)}><ArrowUp size={14} /></button><button className="icon-button" aria-label={`Move clip ${index + 1} down`} disabled={index === clips.length - 1} onClick={() => move(index, index + 1)}><ArrowDown size={14} /></button><button className="icon-button" aria-label={`Remove merge clip ${index + 1}`} onClick={() => setIds(current => current.filter((_, i) => i !== index))}><X size={14} /></button></li>)}</ol>
      <label className="stacked-label">Add a clip<select aria-label="Add merge clip" value="" onChange={event => { if (event.target.value) setIds(current => [...current, event.target.value]); }}><option value="">Choose imported media…</option>{editor.assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label className="stacked-label">Merge format<select aria-label="Merge format" value={format ?? ''} onChange={event => setSettings(current => ({ ...(current ?? outputSettings(defaultSettings(editor.asset!))), format: event.target.value as OutputSettings['format'] }))}>{formats.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
      {settings && <label className="switch-row"><span>Include first clip artwork<small>For compatible audio formats</small></span><input type="checkbox" aria-label="Include merge artwork" checked={settings.includeArtwork} disabled={!format || !getFormat(format).artwork || clips[0]?.artworkIndex === undefined} onChange={event => setSettings(current => current ? { ...current, includeArtwork: event.target.checked } : current)} /></label>}
      <p className="field-note">{ids.reduce((total, id) => total + editedDuration(editor.settingsFor(id)), 0).toFixed(2)} seconds • output quality and bitrate use your current settings.</p>
    </fieldset>
    {merge.error && <p className="project-error" role="alert">{merge.error}</p>}
    {merge.progress && <p role="status">{merge.progress.message} {Math.round(merge.progress.ratio * 100)}%</p>}
    {merge.result?.url && <a className="button subtle small" href={merge.result.url} download={merge.result.name}>Save merged file</a>}{merge.result?.path && <p className="saved-path">Saved to {merge.result.path}</p>}
    <div className="project-actions">{running ? <button className="button subtle small" onClick={editor.cancel}>Cancel merge</button> : <button className="button primary small" disabled={!!editor.busy || ids.length < 2 || !format} onClick={() => { if (settings && format) void merge.start(ids, { ...settings, format }); }}>Export merged file</button>}</div>
  </dialog>;
}
