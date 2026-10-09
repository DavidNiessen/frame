import { useEffect, useRef, useState } from 'react';
import { Download, Link, LoaderCircle, X } from 'lucide-react';
import type { Editor } from '../hooks/useEditor';
import { mediaUrl } from '../core/remote-media';

export function UrlImportDialog({ open, close, editor }: { open: boolean; close: () => void; editor: Editor }) {
  const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(''), [error, setError] = useState(''), [running, setRunning] = useState(false);
  const submitting = useRef(false);
  useEffect(() => {
    if (open) { setUrl(''); setError(''); dialog.current?.showModal(); input.current?.focus(); }
    else dialog.current?.close();
  }, [open]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current || editor.busy) return;
    setError('');
    let address: string;
    try { address = mediaUrl(url).href; } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); input.current?.focus(); return; }
    submitting.current = true; setRunning(true);
    try { if (await editor.importUrl(address)) close(); else setError('Wait for processing to finish, then try again.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load this media URL.'); }
    finally { submitting.current = false; setRunning(false); }
  }
  return <dialog ref={dialog} className="shortcuts-dialog url-import-dialog" aria-labelledby="url-import-title" onCancel={event => { if (running) { event.preventDefault(); editor.cancel(); } else close(); }}>
    <div className="dialog-heading"><h2 id="url-import-title"><Link size={18} />Load from URL</h2><button className="icon-button" aria-label="Close URL import" disabled={running} onClick={close}><X size={18} /></button></div>
    <p className="project-intro">Paste a direct link to a video or audio file. Frame downloads it, then opens it in your current workflow.</p>
    <form onSubmit={event => void submit(event)} noValidate>
      <label className="stacked-label" htmlFor="media-url">Media URL</label>
      <input ref={input} id="media-url" className="media-url-input" type="url" inputMode="url" value={url} onChange={event => { setUrl(event.target.value); setError(''); }} placeholder="https://example.com/song.mp3" maxLength={8192} autoComplete="off" spellCheck={false} disabled={running} aria-describedby="url-import-note" aria-invalid={!!error} />
      <p id="url-import-note" className="field-note">Direct files only; page links and streaming playlists are not supported.{editor.platform === 'web' && ' The host must allow cross-origin downloads (CORS).'} Export a copy to keep downloaded media after this session.</p>
      {running && <div className="url-import-progress" role="status"><span><LoaderCircle size={16} className="spinner" />{editor.progress?.message || 'Preparing your download…'}</span><progress aria-label="URL import progress" max={1} value={editor.progress?.ratio || undefined} /></div>}
      {error && <p className="project-error" role="alert">{error}</p>}
      <div className="project-actions">{running ? <button type="button" className="button subtle" onClick={editor.cancel}>Cancel download</button> : <><button type="button" className="button subtle" onClick={close}>Cancel</button><button type="submit" className="button primary" disabled={!!editor.busy || !url.trim()}><Download size={15} />Load media</button></>}</div>
    </form>
  </dialog>;
}
