import { TransientMessage } from './TransientMessage';
import { useEffect, useRef, useState } from 'react';
import { Grid2X2, LoaderCircle, X } from 'lucide-react';
import { defaultContactSheet, sheetDimensions } from '../core/contact-sheet';
import { editedDuration } from '../core/timeline';
import { labelContactSheet } from '../engines/contact-sheet-labels';
import type { Editor } from '../hooks/useEditor';
export function ContactSheetDialog({ editor, close }: { editor: Editor; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), urlRef = useRef('');
  const [options, setOptions] = useState(defaultContactSheet), [url, setUrl] = useState(''), [loading, setLoading] = useState(false), [progress, setProgress] = useState(0), [error, setError] = useState('');
  const dimensions = sheetDimensions(options), asset = editor.asset!, edit = editor.edit!;
  useEffect(() => { dialog.current?.showModal(); return () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }; }, []);
  useEffect(() => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); urlRef.current = ''; setUrl(''); }, [options, asset.id, edit]);
  async function generate() {
    if (editor.busy || loading) return; setLoading(true); setProgress(0); setError('');
    try {
      const raw = await editor.runExclusive('analysis', engine => engine.contactSheet(asset, edit, options, p => setProgress(p.ratio)));
      let labeled = ''; try { labeled = await labelContactSheet(raw, asset.name, editedDuration(edit), options); } finally { URL.revokeObjectURL(raw); }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current); urlRef.current = labeled; setUrl(labeled);
    } catch (issue) { setError((issue as Error).message); } finally { setLoading(false); }
  }
  return <dialog ref={dialog} className="shortcuts-dialog contact-sheet-dialog" aria-label="Video contact sheet" onCancel={event => { if (loading) event.preventDefault(); else close(); }}><div className="dialog-heading"><h2><Grid2X2 size={18} />Video contact sheet</h2><button className="icon-button" aria-label="Close contact sheet" disabled={loading} onClick={close}><X size={18} /></button></div><p>Share a visual overview of the edited sequence, including clip order and effects.</p><fieldset disabled={loading || !!editor.busy} className="contact-sheet-options"><label>Columns<select aria-label="Contact sheet columns" value={options.columns} onChange={event => setOptions({ ...options, columns: Number(event.target.value) })}>{[2, 3, 4, 5, 6].map(value => <option key={value}>{value}</option>)}</select></label><label>Rows<select aria-label="Contact sheet rows" value={options.rows} onChange={event => setOptions({ ...options, rows: Number(event.target.value) })}>{[2, 3, 4, 5, 6].map(value => <option key={value}>{value}</option>)}</select></label><label>Frame width<select aria-label="Contact sheet frame width" value={options.width} onChange={event => setOptions({ ...options, width: Number(event.target.value) })}>{[160, 240, 320, 480].map(value => <option key={value} value={value}>{value} px</option>)}</select></label><label className="switch-row"><span>Show sequence timestamps</span><input type="checkbox" checked={options.timestamps} onChange={event => setOptions({ ...options, timestamps: event.target.checked })} /></label></fieldset><p className="field-note">{dimensions.width} × {dimensions.height + 64} pixels · {options.columns * options.rows} evenly spaced samples</p>{url && <img className="contact-sheet-preview" src={url} alt="Contact sheet of the edited sequence" />}{error && <TransientMessage role="alert">{error}</TransientMessage>}<div className="project-actions">{loading ? <><span role="status"><LoaderCircle size={14} className="spinner" />Generating {Math.round(progress * 100)}%</span><button className="button subtle small" onClick={editor.cancel}>Cancel generation</button></> : <><button className="button primary small" disabled={!!editor.busy} onClick={() => void generate()}>{url ? 'Regenerate contact sheet' : 'Generate contact sheet'}</button>{url && <a className="button subtle small" download={`${asset.name.replace(/\.[^.]+$/, '')}-contact-sheet.png`} href={url}>Save contact sheet PNG</a>}</>}</div></dialog>;
}
