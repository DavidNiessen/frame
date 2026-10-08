import { ArrowUpRight, Check, Download, SlidersHorizontal, RotateCcw, X } from 'lucide-react';
import type { Editor } from '../hooks/useEditor';
import { editedDuration } from '../core/timeline';
import { time, bytes } from '../core/format';
import { AudioCleanupControls } from './AudioCleanupControls';
import { FadeControls } from './FadeControls';
import { SpeedControls } from './SpeedControls';
import { EditControls } from './EditControls';
import { ExportControls } from './ExportControls';
export function Inspector({ editor, current }: { editor: Editor; current: number }) {
  const { asset, edit, busy, result } = editor;
  return <aside className="inspector panel"><div className="panel-heading"><h2><SlidersHorizontal size={16} /> Edit & export</h2>{asset && <button className="icon-button" aria-label="Reset all edits" disabled={!!busy} onClick={editor.reset}><RotateCcw size={15} /></button>}</div>
    {!asset || !edit ? <div className="inspector-empty"><span className="empty-controls" aria-hidden="true"><i /><i /><i /></span><h3>A few thoughtful adjustments.</h3><p>Choose a file to trim, crop, adjust its volume, or make it something new.</p><div className="supported-formats"><span>VIDEO</span><p>MP4 · MOV · WebM · MKV · GIF</p><span>AUDIO</span><p>MP3 · WAV · FLAC · OGG · M4A</p></div></div> : <>
      <div className="inspector-scroll"><fieldset disabled={!!busy}><EditControls asset={asset} edit={edit} update={editor.update} current={current} /><SpeedControls edit={edit} update={editor.update} /><FadeControls asset={asset} edit={edit} update={editor.update} /><AudioCleanupControls editor={editor} /><ExportControls asset={asset} edit={edit} update={editor.update} /></fieldset></div>
      <div className="export-footer"><div className="export-summary"><span>Ready to make the cut</span><strong>{time(editedDuration(edit))} <i>·</i> {edit.format.toUpperCase()}</strong></div>
        {editor.busy === 'analysis' ? <div className="export-progress"><span>Analyzing your media…</span><button className="button subtle small" onClick={editor.cancel}>Cancel processing</button></div> : editor.progress ? <div className="export-progress"><div className="progress-track" role="progressbar" aria-label="Export progress" aria-valuenow={Math.round(editor.progress.ratio * 100)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${editor.progress.ratio * 100}%` }} /></div><span>{editor.progress.message}</span><button className="button subtle small" onClick={editor.cancel}><X size={14} />Cancel export</button></div> : <button className="button primary export-button" disabled={!!busy} onClick={() => void editor.exportMedia()}><Download size={17} />Export {edit.format.toUpperCase()}<ArrowUpRight size={16} /></button>}
        {result && <div className="export-result" role="status"><div><Check size={15} /><strong>Export ready</strong><button className="icon-button" aria-label="Dismiss export result" onClick={editor.dismissResult}><X size={13} /></button></div><p>{result.name} <span>· {bytes(result.size)}</span></p>{result.url ? <a className="button small subtle" href={result.url} download={result.name}><Download size={14} />Save file</a> : <p className="saved-path" title={result.path}>Saved to {result.path}</p>}</div>}
        <p className="export-note">Your original stays just as it is.</p>
      </div>
    </>}
  </aside>;
}
