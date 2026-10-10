import { useLoadingActivity } from './useLoadingActivity';
import { useEffect, useRef, useState } from 'react';
import type { BatchJob } from '../core/batch';

export function useDownloadArchive(jobs: BatchJob[]) {
  const [url, setUrl] = useState(''), [busy, setBusy] = useState(false), [progress, setProgress] = useState(0), [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null), urlRef = useRef('');
  const signature = jobs.map(job => job.result?.url || '').join('|');
  function reset() { controller.current?.abort(); controller.current = null; if (urlRef.current) URL.revokeObjectURL(urlRef.current); urlRef.current = ''; setUrl(''); setBusy(false); setError(''); }
  useLoadingActivity(busy, 'Preparing ZIP download…', { priority: 30, ratio: progress, cancel: reset, cancelLabel: 'Cancel download preparation' });
  useEffect(() => { reset(); }, [signature]);
  useEffect(() => () => { controller.current?.abort(); controller.current = null; if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);
  async function download() {
    if (controller.current) return;
    if (urlRef.current) { save(urlRef.current); return; }
    const outputs = jobs.flatMap(job => job.status === 'done' && job.result?.url ? [job.result] : []);
    if (!outputs.length) return;
    const active = new AbortController(); controller.current = active; setBusy(true); setProgress(0); setError('');
    try {
      const { createDownloadArchive } = await import('../engines/download-archive');
      const blob = await createDownloadArchive(outputs, active.signal, setProgress);
      if (active.signal.aborted) return;
      urlRef.current = URL.createObjectURL(blob); setUrl(urlRef.current); save(urlRef.current);
    } catch (error) { if (!active.signal.aborted) setError(error instanceof Error ? error.message : 'Unable to prepare the download.'); }
    finally { if (controller.current === active) { controller.current = null; setBusy(false); } }
  }
  return { url, busy, progress, error, download, cancel: reset };
}
function save(url: string) { const link = document.createElement('a'); link.href = url; link.download = 'converted-media.zip'; link.click(); }
