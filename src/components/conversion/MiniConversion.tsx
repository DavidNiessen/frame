import { ChevronDown, ChevronUp, Clapperboard, FolderPlus, Plus, TriangleAlert, X } from 'lucide-react';
import { useEditor } from '../../hooks/useEditor';
import { useConversion } from '../../hooks/useConversion';
import { useDesktopLaunches } from '../../hooks/useDesktopLaunches';
import { useMiniConversion } from '../../hooks/useMiniConversion';
import { useTheme } from '../../hooks/useTheme';
import { ConversionSettings } from './ConversionSettings';
import { ConversionQueue } from './ConversionQueue';
import { ConversionResults } from './ConversionResults';

export function MiniConversion() {
  useTheme();
  const editor = useEditor(), conversion = useConversion(editor);
  const mini = useMiniConversion(editor, conversion);
  useDesktopLaunches(editor, () => mini.setExpanded(true), conversion.archive.busy, (ids, append) => {
    // Selection arrives during import, after the launch queue has waited for encoding.
    const fresh = !append || conversion.batch.jobs.length > 0;
    if (fresh) { conversion.archive.cancel(); conversion.batch.clear(); }
    conversion.setIds(current => fresh ? ids : [...new Set([...current, ...ids])]);
  });
  const jobs = conversion.batch.jobs;
  const ratio = jobs.length ? jobs.reduce((sum, job) => sum + (job.status === 'running' ? job.progress : job.status === 'waiting' ? 0 : 1), 0) / jobs.length : 0;
  const progress = Math.round(ratio * 100);
  const active = jobs.find(job => job.status === 'running');
  return <main className={`mini-converter ${mini.expanded ? 'expanded' : 'collapsed'} ${mini.finishing ? 'finishing' : ''}`} aria-label="Quick conversion">
    <section className="mini-card">
      {!mini.expanded ? <div className="mini-progress">
        <div className="mini-progress-content"><span className="sr-only" role="status">{conversion.batch.running ? `Converting ${active?.asset.name || 'your files'}` : 'Conversion complete'}</span><div className="progress-track" role="progressbar" aria-label="Conversion progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${ratio * 100}%` }} /></div><span className="mini-percentage">{progress}%</span></div>
        <button className="mini-expand" aria-label="Expand conversion" title="Expand conversion" onClick={() => mini.setExpanded(true)}><ChevronUp size={22} /></button>
      </div> : <>
        <header className="mini-header"><span className="mini-brand" aria-hidden="true"><Clapperboard size={19} /></span><div><h1>Quick conversion<span>.</span></h1><p>{editor.busy === 'import' ? 'Reading your files…' : `${editor.assets.length} ${editor.assets.length === 1 ? 'file' : 'files'} · originals preserved`}</p></div><div className="mini-header-actions">{conversion.batch.running && <button className="icon-button" aria-label="Collapse conversion" title="Collapse conversion" onClick={() => mini.setExpanded(false)}><ChevronDown size={20} /></button>}<button className="icon-button" aria-label="Close conversion" title={conversion.busy ? 'Cancel conversion before closing' : 'Close conversion'} disabled={conversion.busy} onClick={mini.dismiss}><X size={18} /></button></div></header>
        <div className="mini-body">
          {editor.busy === 'import' && <p className="mini-status" role="status">{editor.progress?.message || 'Reading your files…'}</p>}
          {editor.assets.length > 0 && <details className="mini-files"><summary>Selected files <span>{conversion.ids.length}</span></summary><ConversionQueue editor={editor} conversion={conversion} /></details>}
          {editor.importReport && editor.importReport.issues.length > 0 && <div className="mini-import-errors" role="alert"><TriangleAlert size={16} /><div><strong>{editor.importReport.issues.length} {editor.importReport.issues.length === 1 ? 'file' : 'files'} could not be read</strong>{editor.importReport.issues.slice(0, 50).map((issue, i) => <p key={i}>{issue.name}: {issue.message}</p>)}</div></div>}
          {jobs.length > 0 && <ConversionResults editor={editor} conversion={conversion} />}
          <ConversionSettings editor={editor} conversion={conversion} />
        </div>
        <footer className="mini-footer"><div><button disabled={conversion.busy} onClick={() => void editor.importMedia()}><Plus size={14} />Add files</button><button disabled={conversion.busy} onClick={() => void editor.importFolder()}><FolderPlus size={14} />Add folder</button></div></footer>
        {editor.notice && editor.busy !== 'import' && <p className="mini-notice" role="status">{editor.notice}</p>}
      </>}
    </section>
  </main>;
}
