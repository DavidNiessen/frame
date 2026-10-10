import { TransientMessage } from './TransientMessage';
import { useEffect, useRef } from 'react';
import { FolderOpen, Upload, X } from 'lucide-react';
import type { Editor } from '../hooks/useEditor';
import type { Projects } from '../hooks/useProjects';
export function ProjectDialog({ projects, editor, onImport }: { projects: Projects; editor: Editor; onImport: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (projects.pending) dialog.current?.showModal(); else dialog.current?.close(); }, [projects.pending]);
  return <dialog ref={dialog} className="shortcuts-dialog project-dialog" aria-labelledby="project-title" onCancel={projects.close}>
    <div className="dialog-heading"><h2 id="project-title"><FolderOpen size={18} /> Open project</h2><button className="icon-button" aria-label="Close project" onClick={projects.close}><X size={18} /></button></div>
    {projects.pending && <><p className="project-intro"><strong>{projects.pending.name}</strong><br />Project files store edits. Link the original media to continue.</p>
      <div className="project-sources">{projects.pending.sources.map(({ source }, index) => <label className="stacked-label" key={index}><span>{source.name}</span><select aria-label={`Source for ${source.name}`} value={projects.links[index] ?? ''} onChange={event => projects.link(index, event.target.value)} disabled={!!editor.busy}><option value="">Choose imported media…</option>{editor.assets.filter(a => a.kind === source.kind).map(a => <option key={a.id} value={a.id}>{a.relativePath ?? a.name}</option>)}</select><small className="field-note">{projects.links[index] ? 'Linked • confirm this is the correct source' : 'Missing • import the source file, then select it here'}</small></label>)}</div>
      {!projects.canRestore && <p className="field-note">Link a different imported file to each source.</p>}
      {projects.error && <TransientMessage className="project-error" role="alert">{projects.error}</TransientMessage>}
      <div className="project-actions"><button className="button subtle small" disabled={!!editor.busy} onClick={onImport}><Upload size={14} />Choose source files</button><button className="button primary small" disabled={!projects.canRestore || !!editor.busy} onClick={projects.restore}>Restore edits</button></div>
    </>}
  </dialog>;
}
