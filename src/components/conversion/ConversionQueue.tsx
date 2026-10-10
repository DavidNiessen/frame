import { useEffect, useRef, useState } from 'react';
import { Check, Download, Film, LoaderCircle, Music2, Search, Trash2, TriangleAlert } from 'lucide-react';
import { canConvert } from '../../core/conversion';
import { bytes, time } from '../../core/format';
import type { Editor } from '../../hooks/useEditor';
import type { Conversion } from '../../hooks/useConversion';
import { MediaInfo } from '../MediaInfo';

const pageSize = 50;
export function ConversionQueue({ editor, conversion: c, onClear, clearDisabled }: { editor: Editor; conversion: Conversion; onClear?: () => void; clearDisabled?: boolean }) {
  const [query, setQuery] = useState(''), [page, setPage] = useState(0);
  const selectAll = useRef<HTMLInputElement>(null);
  const filtered = editor.assets.filter(asset => `${asset.name} ${asset.relativePath || ''}`.toLowerCase().includes(query.toLowerCase()));
  const pending = filtered.filter(asset => c.latestJobs.get(asset.id)?.status !== 'done');
  const included = pending.filter(asset => c.ids.includes(asset.id)).length;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)); const currentPage = Math.min(page, pages - 1);
  useEffect(() => { const index = filtered.findIndex(asset => asset.id === editor.selected); if (index >= 0) setPage(Math.floor(index / pageSize)); }, [editor.selected]);
  useEffect(() => { if (selectAll.current) selectAll.current.indeterminate = included > 0 && included < pending.length; }, [included, pending.length]);
  return <section className="conversion-files panel" aria-labelledby="conversion-files-title">
    <div className="conversion-panel-title"><span className="conversion-step">1</span><div><h2 id="conversion-files-title">Files to convert <span className="count">{editor.assets.length}</span></h2><p>{c.selected.length} selected · {bytes(c.selected.reduce((sum, asset) => sum + asset.size, 0))}</p></div><label className="conversion-search"><Search size={15} /><input type="search" placeholder="Search files…" aria-label="Search conversion files" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>{onClear && <button className="button subtle small conversion-clear" disabled={c.busy || clearDisabled} onClick={onClear} title="Clear library and saved workspace"><Trash2 size={14} />Clear library</button>}</div>
    <div className="conversion-table-wrap"><table className="conversion-table"><thead><tr><th className="conversion-check"><input ref={selectAll} type="checkbox" aria-label="Select all pending files" checked={pending.length > 0 && included === pending.length} disabled={c.busy || !pending.length} onChange={event => c.setIds(event.target.checked ? [...new Set([...c.ids, ...pending.map(asset => asset.id)])] : c.ids.filter(id => !pending.some(asset => asset.id === id)))} /></th><th>Source file</th><th className="conversion-length">Duration</th><th>Output</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
      {filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(asset => {
        const job = c.latestJobs.get(asset.id), compatible = canConvert(asset, c.output), finished = job?.status === 'done';
        const status = job ? job.status === 'running' ? `${Math.round(job.progress * 100)}%` : job.status === 'done' ? 'Converted' : job.status === 'failed' ? 'Failed' : job.status === 'cancelled' ? 'Cancelled' : 'Queued' : compatible ? 'Ready' : 'Incompatible';
        return <tr key={asset.id} className={finished ? 'converted' : !c.ids.includes(asset.id) ? 'excluded' : ''}><td className="conversion-check"><input type="checkbox" aria-label={`Convert ${asset.relativePath || asset.name}`} disabled={c.busy || finished} checked={c.ids.includes(asset.id)} onChange={() => c.toggle(asset.id)} /></td>
          <td><div className="conversion-source"><span className={`conversion-file-icon ${asset.kind}`}>{asset.kind === 'audio' ? <Music2 size={19} /> : <Film size={19} />}</span><div><strong title={asset.name}>{asset.name}</strong><small title={asset.relativePath}>{asset.relativePath?.includes('/') ? asset.relativePath.slice(0, asset.relativePath.lastIndexOf('/')) + ' · ' : ''}{bytes(asset.size)}</small></div></div></td>
          <td className="conversion-length">{time(asset.duration)}</td><td><span className="conversion-target" title={job?.result?.path || job?.result?.relativePath || c.filenameFor(asset)}>{(job?.edit.format || c.output.format).toUpperCase()}</span></td>
          <td><span className={`conversion-file-status ${job?.status || (compatible ? 'ready' : 'failed')}`}>{finished ? <Check size={13} /> : job?.status === 'running' ? <LoaderCircle className="spinner" size={13} /> : job?.status === 'failed' || !compatible ? <TriangleAlert size={13} /> : null}{status}</span>{job?.error && <details className="conversion-file-error"><summary>Error details</summary><p>{job.error}</p></details>}</td>
          <td className="conversion-row-action"><MediaInfo asset={asset} />{job?.result?.url ? <a className="icon-button" href={job.result.url} download={job.result.name} aria-label={`Download ${job.result.relativePath || job.result.name}`} title="Download this file"><Download size={15} /></a> : <button className="icon-button" aria-label={`Remove ${asset.relativePath || asset.name} from conversion`} disabled={c.busy || finished} onClick={() => void editor.remove(asset)}><Trash2 size={14} /></button>}</td>
        </tr>;
      })}
    </tbody></table>{!filtered.length && <p className="conversion-no-results">No files match “{query}”.</p>}</div>
    <div className="conversion-table-footer"><span>{filtered.length ? `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, filtered.length)} of ${filtered.length} files` : '0 files'}</span>{pages > 1 && <div><button disabled={!currentPage} onClick={() => setPage(value => value - 1)}>Previous</button><span>{currentPage + 1} / {pages}</span><button disabled={currentPage + 1 >= pages} onClick={() => setPage(value => value + 1)}>Next</button></div>}<span>Original files are preserved</span></div>
  </section>;
}
