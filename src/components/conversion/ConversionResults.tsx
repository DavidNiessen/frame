import { TransientMessage } from '../TransientMessage';
import { conversionReport } from '../../core/conversion-report';
import { downloadText } from '../../storage/download-text';
import { CheckCircle2, Download, FolderOpen, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { Editor } from '../../hooks/useEditor';
import type { Conversion } from '../../hooks/useConversion';

export function ConversionResults({ conversion: c, editor }: { conversion: Conversion; editor: Editor }) {
  if (!c.batch.jobs.length) return null;
  const active = c.batch.jobs.find(job => job.status === 'running');
  const processed = c.batch.jobs.filter(job => !['waiting', 'running'].includes(job.status)).length;
  return <section className={`conversion-results ${c.batch.running ? 'running' : ''}`} aria-label="Conversion results">
    <div className="conversion-results-heading"><span className="conversion-result-icon">{c.batch.running ? <LoaderCircle className="spinner" size={20} /> : c.unfinished.length ? <TriangleAlert size={20} /> : <CheckCircle2 size={20} />}</span><div><h2>{c.batch.running ? 'Converting your files' : c.unfinished.length ? 'Some files need attention' : 'Your files are ready'}</h2><p role="status">{c.batch.running ? active?.asset.name || 'Preparing conversion…' : `${c.done.length} converted${c.unfinished.length ? ` · ${c.unfinished.length} unfinished` : ''}`}</p></div><span className="conversion-results-count">{processed} / {c.batch.jobs.length}</span></div>
    <div className="conversion-results-actions">{c.done.length > 0 && (editor.platform === 'desktop' ? <button className="button subtle small" disabled={c.busy} onClick={() => void c.batch.openFolder()}><FolderOpen size={15} />Open output folder</button> : <button className="button primary small" disabled={c.busy} onClick={() => void c.archive.download()}>{c.archive.busy ? <LoaderCircle className="spinner" size={15} /> : <Download size={15} />}{c.archive.busy ? 'Preparing ZIP…' : 'Download all (ZIP)'}</button>)}
      <button className="button small" disabled={c.busy} onClick={() => downloadText(`frame-conversion-report-${new Date().toISOString().slice(0, 10)}.csv`, conversionReport(c.batch.jobs), 'text/csv;charset=utf-8')}><Download size={13} />Save conversion report</button>
      <button className="button small" disabled={c.busy} onClick={c.clear}>Clear results</button>
    </div>
    {c.archive.error && <TransientMessage className="conversion-error" role="alert">{c.archive.error}</TransientMessage>}
  </section>;
}
