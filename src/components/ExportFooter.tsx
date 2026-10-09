import { ArrowUpRight, Check, Download, X } from 'lucide-react';
import type { Editor } from '../hooks/useEditor';
import type { EditSettings } from '../core/types';
import { availableFormats } from '../core/formats';
import { editedDuration } from '../core/timeline';
import { time, bytes } from '../core/format';

export function ExportFooter({ editor }: { editor: Editor }) {
  const { asset, edit, busy, result } = editor;
  if (!asset || !edit) return null;
  return <div className="export-footer">
    <div className="export-summary">
      <label htmlFor="output-format">Output format</label><span>{time(editedDuration(edit))}</span>
    </div>
    <select id="output-format" aria-label="Output format" value={edit.format} disabled={!!busy}
      onChange={event => editor.update({ format: event.target.value as EditSettings['format'] })}>
      {availableFormats(asset).map(format => <option value={format.id} key={format.id}>{format.label} — {format.description}</option>)}
    </select>
    {busy === 'analysis' ? <div className="export-progress">
      <span>Analyzing your media…</span>
      <button className="button subtle small" onClick={editor.cancel}>Cancel processing</button>
    </div> : editor.progress ? <div className="export-progress">
      <div className="progress-track" role="progressbar" aria-label="Export progress"
        aria-valuenow={Math.round(editor.progress.ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${editor.progress.ratio * 100}%` }} />
      </div>
      <span>{editor.progress.message}</span>
      <button className="button subtle small" onClick={editor.cancel}><X size={14} />Cancel export</button>
    </div> : <button className="button primary export-button" disabled={!!busy} onClick={() => void editor.exportMedia()}>
      <Download size={17} />Export {edit.format.toUpperCase()}<ArrowUpRight size={16} />
    </button>}
    {result && <div className="export-result" role="status">
      <div><Check size={15} /><strong>Export ready</strong>
        <button className="icon-button" aria-label="Dismiss export result" onClick={editor.dismissResult}><X size={13} /></button>
      </div>
      <p>{result.name} <span>· {bytes(result.size)}</span></p>
      {result.url ? <a className="button small subtle" href={result.url} download={result.name}>
        <Download size={14} />Save file
      </a> : <p className="saved-path" title={result.path}>Saved to {result.path}</p>}
    </div>}
  </div>;
}
