import { hasEditedAudio } from '../core/audio-layers';
import { ArrowUpRight, Download, X } from 'lucide-react';
import type { Editor } from '../hooks/useEditor';
import type { EditSettings } from '../core/types';
import { availableFormats } from '../core/formats';
import { editedDuration } from '../core/timeline';
import { time } from '../core/format';

export function ExportFooter({ editor }: { editor: Editor }) {
  const { asset, edit, busy, result } = editor;
  if (!asset || !edit) return null;
  return <div className="export-footer">
    <div className="export-summary">
      <label htmlFor="output-format">Output format</label><span>{time(editedDuration(edit))}</span>
    </div>
    <select id="output-format" aria-label="Output format" value={edit.format} disabled={!!busy}
      onChange={event => editor.update({ format: event.target.value as EditSettings['format'] })}>
      {availableFormats({ ...asset, hasAudio: hasEditedAudio(asset, edit) }).map(format => <option value={format.id} key={format.id}>{format.label} — {format.description}</option>)}
    </select>
    {busy === 'analysis' ? <div className="export-progress">
      <span>Analyzing your media…</span>
      <button className="button subtle small" onClick={editor.cancel}>Cancel processing</button>
    </div> : editor.progress ? <div className="export-progress">
      <span>{editor.progress.message}</span>
      <button className="button subtle small" onClick={editor.cancel}><X size={14} />Cancel export</button>
    </div> : <button className="button primary export-button" disabled={!!busy} onClick={() => void editor.exportMedia()}>
      <Download size={17} />Export {edit.format.toUpperCase()}<ArrowUpRight size={16} />
    </button>}
    {result?.url && <a className="button small subtle export-download" href={result.url} download={result.name}>
      <Download size={14} />Save file
    </a>}
  </div>;
}
